/**
 * BeLa Cleaning — Appointment Reminder Scheduler (Milestone 6 amendment)
 *
 * Container-bound to the Bookings Google Sheet, same as
 * paymentScheduler.gs. Runs on an hourly time-driven trigger: scans the
 * Bookings sheet for rows that look due for their 72-hour appointment
 * reminder, and calls the BeLa reminder endpoint
 * (POST /api/reminders/process-due) with just their Booking IDs.
 *
 * This script NEVER talks to Gmail directly and NEVER performs the actual
 * DST-aware "what time does this booking start" conversion — it derives
 * each booking's service start entirely from two already-computed,
 * already-absolute values already in this sheet (Scheduled Charge At,
 * Estimated Duration Minutes) via plain millisecond arithmetic. The
 * Vercel endpoint independently re-derives and re-validates everything
 * before doing anything and is the only thing that ever sends email — see
 * docs/manage-booking.md and reminderService.ts.
 *
 * Reuses the exact same authentication as paymentScheduler.gs —
 * PROCESS_DUE_ENDPOINT_URL / PAYMENT_SCHEDULER_SECRET /
 * VERCEL_PROTECTION_BYPASS Script Properties are shared between both
 * schedulers; only the reminder endpoint URL differs (see setup below).
 *
 * ---- One-time setup (see apps-script/README.md and the Milestone 6
 * amendment report for full steps) ----
 * 1. Open Extensions > Apps Script from the Bookings spreadsheet (the
 *    same project paymentScheduler.gs already lives in, if that's already
 *    set up there — otherwise paste both files in).
 * 2. Paste this file in as a second script file.
 * 3. Project Settings > Script Properties, add (in addition to whatever
 *    paymentScheduler.gs already needs):
 *      REMINDER_PROCESS_DUE_ENDPOINT_URL - the stable Preview endpoint
 *                                           URL for /api/reminders/process-due
 *    (PAYMENT_SCHEDULER_SECRET and VERCEL_PROTECTION_BYPASS are reused
 *    as-is from the existing payment scheduler setup — do not duplicate.)
 * 4. Run createReminderTimeDrivenTrigger() once from the editor (Run
 *    menu) and approve the authorization prompt. This installs the
 *    hourly trigger; only needs to be done once.
 */

var REMINDER_BOOKING_STATUS_CANCELLED = "Cancelled";
var REMINDER_STATUS_SENT = "Sent";
var REMINDER_STATUS_FAILED = "Failed";

var COL_REM_BOOKING_ID = "Booking ID";
var COL_REM_BOOKING_STATUS = "Booking Status";
var COL_REM_REMINDER_STATUS = "Appointment Reminder Status";
var COL_REM_SCHEDULED_CHARGE_AT = "Scheduled Charge At";
var COL_REM_ESTIMATED_DURATION_MINUTES = "Estimated Duration Minutes";

// Must match reminderService.ts's own constants exactly — this file only
// ever uses them for the same due-ness *screening* decision the Vercel
// endpoint re-derives and re-validates authoritatively; a mismatch here
// only affects which booking IDs get proposed, never what actually
// happens to any of them.
var REMINDER_WINDOW_HOURS = 72;
var CHARGE_DELAY_AFTER_END_MINUTES = 60; // must match scheduledCharge.ts's CHARGE_DELAY_AFTER_END_MINUTES

/** One-time setup: installs the hourly time-driven trigger. Run manually once from the editor. */
function createReminderTimeDrivenTrigger() {
  var existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === "runReminderScheduler";
  });
  existing.forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("runReminderScheduler").timeBased().everyHours(1).create();
  Logger.log("Installed hourly trigger for runReminderScheduler.");
}

/** The scheduled entry point — this is what the hourly trigger calls. */
function runReminderScheduler() {
  var props = PropertiesService.getScriptProperties();
  var endpointUrl = props.getProperty("REMINDER_PROCESS_DUE_ENDPOINT_URL");
  var schedulerSecret = props.getProperty("PAYMENT_SCHEDULER_SECRET"); // reused, not a new secret
  var bypassSecret = props.getProperty("VERCEL_PROTECTION_BYPASS"); // reused, not a new secret

  if (!endpointUrl || !schedulerSecret) {
    Logger.log("ERROR: Missing REMINDER_PROCESS_DUE_ENDPOINT_URL or PAYMENT_SCHEDULER_SECRET script property. Aborting.");
    return;
  }

  var dueBookingIds = findDueReminderIds_();
  if (dueBookingIds.length === 0) {
    Logger.log("No due reminders this run.");
    return;
  }

  Logger.log("Found " + dueBookingIds.length + " due reminder(s): " + dueBookingIds.join(", "));

  var MAX_BOOKING_IDS_PER_REQUEST = 100; // must match app/api/reminders/process-due/route.ts
  for (var i = 0; i < dueBookingIds.length; i += MAX_BOOKING_IDS_PER_REQUEST) {
    var chunk = dueBookingIds.slice(i, i + MAX_BOOKING_IDS_PER_REQUEST);
    callReminderProcessDueEndpoint_(endpointUrl, schedulerSecret, bypassSecret, chunk);
  }
}

/** Scans the Bookings sheet and returns Booking IDs that look due for a reminder right now. */
function findDueReminderIds_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BOOKINGS_SHEET_NAME);
  var values = sheet.getDataRange().getValues();
  var header = values[0];

  var idxBookingId = header.indexOf(COL_REM_BOOKING_ID);
  var idxBookingStatus = header.indexOf(COL_REM_BOOKING_STATUS);
  var idxReminderStatus = header.indexOf(COL_REM_REMINDER_STATUS);
  var idxScheduledChargeAt = header.indexOf(COL_REM_SCHEDULED_CHARGE_AT);
  var idxDuration = header.indexOf(COL_REM_ESTIMATED_DURATION_MINUTES);

  if (idxBookingId === -1 || idxReminderStatus === -1 || idxScheduledChargeAt === -1 || idxDuration === -1) {
    Logger.log("ERROR: One or more expected columns not found in the Bookings sheet header row. Aborting scan.");
    return [];
  }

  var now = new Date();
  var dueIds = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var bookingId = row[idxBookingId];
    if (!bookingId) continue;

    var bookingStatus = idxBookingStatus === -1 ? "" : row[idxBookingStatus];
    if (bookingStatus === REMINDER_BOOKING_STATUS_CANCELLED) continue;

    var reminderStatus = row[idxReminderStatus];
    if (reminderStatus === REMINDER_STATUS_SENT || reminderStatus === REMINDER_STATUS_FAILED) continue; // terminal — never re-propose

    var scheduledChargeAt = parseReminderSheetTimestamp_(row[idxScheduledChargeAt]);
    var durationMinutes = Number(row[idxDuration]);
    if (!scheduledChargeAt || !durationMinutes || durationMinutes <= 0) continue;

    var serviceStartAt = new Date(scheduledChargeAt.getTime() - (durationMinutes + CHARGE_DELAY_AFTER_END_MINUTES) * 60000);
    var dueAt = new Date(serviceStartAt.getTime() - REMINDER_WINDOW_HOURS * 60 * 60000);

    if (now.getTime() >= dueAt.getTime() && now.getTime() < serviceStartAt.getTime()) {
      dueIds.push(String(bookingId));
    }
  }

  return dueIds;
}

/** Same timestamp-parsing tolerance as paymentScheduler.gs's parseSheetTimestamp_. */
function parseReminderSheetTimestamp_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === "[object Date]") return value;
  var parsed = new Date(String(value));
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Same request shape/secret handling as paymentScheduler.gs's callProcessDueEndpoint_. */
function callReminderProcessDueEndpoint_(endpointUrl, schedulerSecret, bypassSecret, bookingIds) {
  var headers = {
    "x-payment-scheduler-secret": schedulerSecret,
  };
  if (bypassSecret) {
    headers["x-vercel-protection-bypass"] = bypassSecret;
  }

  var response = UrlFetchApp.fetch(endpointUrl, {
    method: "post",
    contentType: "application/json",
    headers: headers,
    payload: JSON.stringify({ bookingIds: bookingIds }),
    muteHttpExceptions: true,
  });

  var status = response.getResponseCode();
  if (status !== 200) {
    Logger.log("ERROR: reminders/process-due returned status " + status + ": " + response.getContentText());
    return;
  }
  Logger.log("reminders/process-due response: " + response.getContentText());
}

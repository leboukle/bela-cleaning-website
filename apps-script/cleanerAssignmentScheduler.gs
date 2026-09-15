/**
 * BeLa Cleaning — Cleaner Assignment Scheduler (Milestone 7)
 *
 * Container-bound to the same spreadsheet as paymentScheduler.gs and
 * reminderScheduler.gs. Runs on an hourly time-driven trigger and
 * performs THREE independent scans against the "Cleaner Assignments" tab
 * (cross-referencing "Bookings" where needed), calling three separate
 * Vercel endpoints with just the relevant IDs:
 *
 *   1. Pending assignments past their Response Deadline
 *      -> POST /api/cleaner-assignments/expire-due
 *   2. Accepted assignments whose booking looks due for the 72-hour
 *      cleaner reminder (completely separate from the customer's own
 *      72-hour reminder — see reminderScheduler.gs, untouched by this file)
 *      -> POST /api/cleaner-assignments/reminders/process-due
 *   3. Accepted assignments whose booking now has a "Completed At"
 *      timestamp but no payout statement sent yet
 *      -> POST /api/cleaner-assignments/payout-statements/process-due
 *
 * This script NEVER talks to Gmail directly and NEVER decides anything
 * authoritatively — every endpoint above independently re-validates
 * everything server-side before doing anything (see assignmentService.ts,
 * cleanerReminderService.ts, completionService.ts). This script's only
 * job is proposing candidate IDs cheaply from data it already has local
 * access to.
 *
 * ---- One-time setup ----
 * 1. Open Extensions > Apps Script from the Bookings spreadsheet (the
 *    same project paymentScheduler.gs / reminderScheduler.gs already live in).
 * 2. Paste this file in as a new script file.
 * 3. Project Settings > Script Properties, add:
 *      CLEANER_EXPIRE_DUE_ENDPOINT_URL             - /api/cleaner-assignments/expire-due
 *      CLEANER_REMINDERS_PROCESS_DUE_ENDPOINT_URL  - /api/cleaner-assignments/reminders/process-due
 *      CLEANER_PAYOUT_STATEMENTS_ENDPOINT_URL      - /api/cleaner-assignments/payout-statements/process-due
 *    (PAYMENT_SCHEDULER_SECRET and VERCEL_PROTECTION_BYPASS are reused
 *    as-is from the existing scheduler setup — do not duplicate.)
 * 4. Run createCleanerAssignmentTimeDrivenTrigger() once from the editor
 *    (Run menu) and approve the authorization prompt. This installs the
 *    hourly trigger; only needs to be done once.
 */

var CLEANER_ASSIGNMENTS_SHEET_NAME = "Cleaner Assignments";

var ASSIGNMENT_STATUS_PENDING = "Pending";
var ASSIGNMENT_STATUS_ACCEPTED = "Accepted";
var CLEANER_REMINDER_STATUS_SENT = "Sent";
var CLEANER_REMINDER_STATUS_FAILED = "Failed";

// Column indexes (0-based) — must match cleanerSheetSchema.ts's
// CLEANER_ASSIGNMENTS_COLUMNS exactly.
var COL_ASG_ID = 0;
var COL_ASG_BOOKING_ID = 1;
var COL_ASG_STATUS = 4;
var COL_ASG_RESPONSE_DEADLINE = 6;
var COL_ASG_CLEANER_REMINDER_STATUS = 14;
var COL_ASG_PAYOUT_STATEMENT_SENT_AT = 17;

// Must match reminderScheduler.gs's own constants exactly — this file
// only ever uses them for the same due-ness *screening* decision the
// Vercel endpoint re-derives and re-validates authoritatively.
var CLEANER_REMINDER_WINDOW_HOURS = 72;
var CHARGE_DELAY_AFTER_END_MINUTES = 60; // must match scheduledCharge.ts's CHARGE_DELAY_AFTER_END_MINUTES

/** One-time setup: installs the hourly time-driven trigger. Run manually once from the editor. */
function createCleanerAssignmentTimeDrivenTrigger() {
  var existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === "runCleanerAssignmentScheduler";
  });
  existing.forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("runCleanerAssignmentScheduler").timeBased().everyHours(1).create();
  Logger.log("Installed hourly trigger for runCleanerAssignmentScheduler.");
}

/** The scheduled entry point — this is what the hourly trigger calls. */
function runCleanerAssignmentScheduler() {
  var props = PropertiesService.getScriptProperties();
  var schedulerSecret = props.getProperty("PAYMENT_SCHEDULER_SECRET"); // reused, not a new secret
  var bypassSecret = props.getProperty("VERCEL_PROTECTION_BYPASS"); // reused, not a new secret

  if (!schedulerSecret) {
    Logger.log("ERROR: Missing PAYMENT_SCHEDULER_SECRET script property. Aborting.");
    return;
  }

  var assignmentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CLEANER_ASSIGNMENTS_SHEET_NAME);
  if (!assignmentsSheet) {
    Logger.log('ERROR: "' + CLEANER_ASSIGNMENTS_SHEET_NAME + '" sheet not found. Aborting.');
    return;
  }
  var assignmentRows = assignmentsSheet.getDataRange().getValues();
  var bookingLookup = buildBookingLookup_();
  var now = new Date();

  runScan_(
    "expire-due",
    props.getProperty("CLEANER_EXPIRE_DUE_ENDPOINT_URL"),
    schedulerSecret,
    bypassSecret,
    "assignmentIds",
    findExpiredPendingIds_(assignmentRows, now),
  );

  runScan_(
    "cleaner-reminders",
    props.getProperty("CLEANER_REMINDERS_PROCESS_DUE_ENDPOINT_URL"),
    schedulerSecret,
    bypassSecret,
    "assignmentIds",
    findDueCleanerReminderIds_(assignmentRows, bookingLookup, now),
  );

  runScan_(
    "payout-statements",
    props.getProperty("CLEANER_PAYOUT_STATEMENTS_ENDPOINT_URL"),
    schedulerSecret,
    bypassSecret,
    "assignmentIds",
    findDuePayoutStatementIds_(assignmentRows, bookingLookup),
  );
}

/** Reads the Bookings sheet once, returning booking-id -> {status, scheduledChargeAt, durationMinutes, completedAt}. */
function buildBookingLookup_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BOOKINGS_SHEET_NAME);
  var values = sheet.getDataRange().getValues();
  var header = values[0];

  var idxId = header.indexOf("Booking ID");
  var idxStatus = header.indexOf("Booking Status");
  var idxChargeAt = header.indexOf("Scheduled Charge At");
  var idxDuration = header.indexOf("Estimated Duration Minutes");
  var idxCompletedAt = header.indexOf("Completed At");

  var lookup = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var id = row[idxId];
    if (!id) continue;
    lookup[String(id)] = {
      status: row[idxStatus],
      scheduledChargeAt: parseCleanerSchedulerTimestamp_(row[idxChargeAt]),
      durationMinutes: Number(row[idxDuration]),
      completedAt: row[idxCompletedAt],
    };
  }
  return lookup;
}

function findExpiredPendingIds_(assignmentRows, now) {
  var ids = [];
  for (var r = 1; r < assignmentRows.length; r++) {
    var row = assignmentRows[r];
    var id = row[COL_ASG_ID];
    if (!id) continue;
    if (row[COL_ASG_STATUS] !== ASSIGNMENT_STATUS_PENDING) continue;
    var deadline = parseCleanerSchedulerTimestamp_(row[COL_ASG_RESPONSE_DEADLINE]);
    if (deadline && now.getTime() >= deadline.getTime()) ids.push(String(id));
  }
  return ids;
}

function findDueCleanerReminderIds_(assignmentRows, bookingLookup, now) {
  var ids = [];
  for (var r = 1; r < assignmentRows.length; r++) {
    var row = assignmentRows[r];
    var id = row[COL_ASG_ID];
    if (!id) continue;
    if (row[COL_ASG_STATUS] !== ASSIGNMENT_STATUS_ACCEPTED) continue;
    var reminderStatus = row[COL_ASG_CLEANER_REMINDER_STATUS];
    if (reminderStatus === CLEANER_REMINDER_STATUS_SENT || reminderStatus === CLEANER_REMINDER_STATUS_FAILED) continue;

    var booking = bookingLookup[String(row[COL_ASG_BOOKING_ID])];
    if (!booking || !booking.scheduledChargeAt || !booking.durationMinutes) continue;

    var serviceStartAt = new Date(booking.scheduledChargeAt.getTime() - (booking.durationMinutes + CHARGE_DELAY_AFTER_END_MINUTES) * 60000);
    var dueAt = new Date(serviceStartAt.getTime() - CLEANER_REMINDER_WINDOW_HOURS * 60 * 60000);
    if (now.getTime() >= dueAt.getTime() && now.getTime() < serviceStartAt.getTime()) ids.push(String(id));
  }
  return ids;
}

function findDuePayoutStatementIds_(assignmentRows, bookingLookup) {
  var ids = [];
  for (var r = 1; r < assignmentRows.length; r++) {
    var row = assignmentRows[r];
    var id = row[COL_ASG_ID];
    if (!id) continue;
    if (row[COL_ASG_STATUS] !== ASSIGNMENT_STATUS_ACCEPTED) continue;
    if (row[COL_ASG_PAYOUT_STATEMENT_SENT_AT]) continue; // already sent

    var booking = bookingLookup[String(row[COL_ASG_BOOKING_ID])];
    if (!booking || !booking.completedAt) continue;
    ids.push(String(id));
  }
  return ids;
}

function parseCleanerSchedulerTimestamp_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === "[object Date]") return value;
  var parsed = new Date(String(value));
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Chunks `ids` and POSTs each chunk to `endpointUrl` under `idsFieldName`. No-op if endpointUrl/ids are missing/empty. */
function runScan_(label, endpointUrl, schedulerSecret, bypassSecret, idsFieldName, ids) {
  if (!endpointUrl) {
    Logger.log("WARN: no endpoint URL configured for " + label + " scan — skipping.");
    return;
  }
  if (ids.length === 0) {
    Logger.log("No due " + label + " this run.");
    return;
  }
  Logger.log("Found " + ids.length + " due " + label + " item(s): " + ids.join(", "));

  var headers = { "x-payment-scheduler-secret": schedulerSecret };
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret;

  var MAX_IDS_PER_REQUEST = 100; // must match each route's own MAX_IDS_PER_REQUEST
  for (var i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    var chunk = ids.slice(i, i + MAX_IDS_PER_REQUEST);
    var payload = {};
    payload[idsFieldName] = chunk;

    var response = UrlFetchApp.fetch(endpointUrl, {
      method: "post",
      contentType: "application/json",
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    var status = response.getResponseCode();
    if (status !== 200) {
      Logger.log("ERROR: " + label + " endpoint returned status " + status + ": " + response.getContentText());
    } else {
      Logger.log(label + " response: " + response.getContentText());
    }
  }
}

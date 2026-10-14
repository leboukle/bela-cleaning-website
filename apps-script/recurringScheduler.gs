/**
 * BeLa Cleaning — Recurring Schedule Reconciliation Scheduler
 *
 * Container-bound to the same spreadsheet as paymentScheduler.gs,
 * reminderScheduler.gs and cleanerAssignmentScheduler.gs. Runs on a
 * 30-minute time-driven trigger. It is the RETRY / RECONCILIATION safety
 * net for automatic recurring appointments: the normal path creates the
 * next appointment immediately when BeLa marks a cleaning complete or a
 * customer cancels one, and this scheduler recovers anything that path
 * missed (a crash, a transient Sheets/Vercel error, a blackout that was
 * later lifted) and alerts the owner to a visit that was never marked
 * complete.
 *
 * It scans the "Recurring Schedules" tab (cross-referencing "Bookings")
 * and calls ONE Vercel endpoint with just the schedule IDs worth looking
 * at:  POST /api/recurring/reconcile
 *
 * This script NEVER creates, edits or deletes a Bookings row itself and
 * NEVER decides anything authoritatively. The endpoint re-reads every
 * schedule and booking and is the only thing that creates appointments —
 * through one serialized creation path (see
 * lib/booking/server/recurringScheduleService.ts). Running this script
 * twice, or concurrently with a completion or cancellation, cannot create
 * a duplicate appointment or send a duplicate email.
 *
 * ---- One-time setup ----
 * 1. Open Extensions > Apps Script from the Bookings spreadsheet (the
 *    same project the other schedulers already live in).
 * 2. Paste this file in as a new script file.
 * 3. Project Settings > Script Properties, add:
 *      RECURRING_RECONCILE_ENDPOINT_URL  - the stable endpoint URL for
 *                                          /api/recurring/reconcile
 *                                          (no query string, no secrets)
 *    (PAYMENT_SCHEDULER_SECRET and VERCEL_PROTECTION_BYPASS are reused
 *    as-is from the existing scheduler setup — do not duplicate.)
 * 4. Run createRecurringReconcileTrigger() once from the editor (Run
 *    menu) and approve the authorization prompt.
 *
 * Apps Script files in one project share a single global namespace, so
 * every name below is prefixed RECUR_ / recur… to avoid colliding with the
 * other scheduler files.
 */

var RECUR_SCHEDULES_SHEET_NAME = "Recurring Schedules";
var RECUR_BOOKINGS_SHEET_NAME = "Bookings";
var RECUR_MAX_IDS_PER_REQUEST = 100; // must match app/api/recurring/reconcile/route.ts

var RECUR_SCHEDULE_ID_HEADER = "Schedule ID";
var RECUR_SCHEDULE_STATUS_HEADER = "Status";
var RECUR_STATUS_ACTIVE = "Active";
var RECUR_STATUS_ENDED = "Ended";

var RECUR_BOOKING_ID_HEADER = "Booking ID";
var RECUR_BOOKING_STATUS_HEADER = "Booking Status";
var RECUR_BOOKING_SCHEDULE_ID_HEADER = "Recurring Schedule ID";
var RECUR_BOOKING_OCCURRENCE_HEADER = "Occurrence Number";
var RECUR_BOOKING_COMPLETED_AT_HEADER = "Completed At";
var RECUR_BOOKING_STATUS_CANCELLED = "Cancelled";

/** One-time setup: installs the 30-minute time-driven trigger. Run manually once from the editor. */
function createRecurringReconcileTrigger() {
  var existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === "runRecurringReconcile";
  });
  existing.forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("runRecurringReconcile").timeBased().everyMinutes(30).create();
  Logger.log("Installed 30-minute trigger for runRecurringReconcile.");
}

/** The scheduled entry point — this is what the trigger calls. */
function runRecurringReconcile() {
  // Never overlap with a previous (slow) run of this same script.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    Logger.log("Another recurring reconcile run is in progress. Skipping this run.");
    return;
  }
  try {
    recurReconcileOnce_();
  } finally {
    lock.releaseLock();
  }
}

function recurReconcileOnce_() {
  var props = PropertiesService.getScriptProperties();
  var endpointUrl = props.getProperty("RECURRING_RECONCILE_ENDPOINT_URL");
  var schedulerSecret = props.getProperty("PAYMENT_SCHEDULER_SECRET"); // reused, not a new secret
  var bypassSecret = props.getProperty("VERCEL_PROTECTION_BYPASS"); // reused, not a new secret

  if (!endpointUrl || !schedulerSecret) {
    Logger.log("ERROR: Missing RECURRING_RECONCILE_ENDPOINT_URL or PAYMENT_SCHEDULER_SECRET script property. Aborting.");
    return;
  }

  var ids = recurFindScheduleIds_();
  if (ids.length === 0) {
    Logger.log("No recurring schedules to reconcile this run.");
    return;
  }
  Logger.log("Reconciling " + ids.length + " schedule(s): " + ids.join(", "));

  for (var i = 0; i < ids.length; i += RECUR_MAX_IDS_PER_REQUEST) {
    recurCallEndpoint_(endpointUrl, schedulerSecret, bypassSecret, ids.slice(i, i + RECUR_MAX_IDS_PER_REQUEST));
  }
}

/**
 * Proposes schedule IDs:
 *  - every Active schedule (generation / completion-missing / payment checks);
 *  - an Ended schedule that still has an upcoming (open) appointment — a
 *    "stop" that was interrupted before it finished cancelling it;
 *  - a recurring INITIAL appointment (Occurrence Number 1, whose schedule ID
 *    is its own Booking ID) that has no schedule row yet — the server
 *    recreates the schedule from the appointment's own row.
 * Existing frequency-labelled bookings (no Occurrence Number) are never
 * proposed, so they are never converted.
 */
function recurFindScheduleIds_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var schedulesSheet = ss.getSheetByName(RECUR_SCHEDULES_SHEET_NAME);
  var bookingsSheet = ss.getSheetByName(RECUR_BOOKINGS_SHEET_NAME);
  if (!bookingsSheet) {
    Logger.log('ERROR: "' + RECUR_BOOKINGS_SHEET_NAME + '" sheet not found. Aborting scan.');
    return [];
  }

  // schedule ID -> status
  var statusById = {};
  if (schedulesSheet && schedulesSheet.getLastRow() > 1) {
    var sRows = schedulesSheet.getDataRange().getValues();
    var sHeader = sRows[0];
    var idxSid = sHeader.indexOf(RECUR_SCHEDULE_ID_HEADER);
    var idxSstatus = sHeader.indexOf(RECUR_SCHEDULE_STATUS_HEADER);
    if (idxSid === -1 || idxSstatus === -1) {
      Logger.log("ERROR: Recurring Schedules header row is missing Schedule ID or Status. Aborting scan.");
      return [];
    }
    for (var r = 1; r < sRows.length; r++) {
      var sid = String(sRows[r][idxSid] || "");
      if (sid && !(sid in statusById)) statusById[sid] = String(sRows[r][idxSstatus] || "");
    }
  }

  var bRows = bookingsSheet.getDataRange().getValues();
  var bHeader = bRows[0];
  var idxBid = bHeader.indexOf(RECUR_BOOKING_ID_HEADER);
  var idxBstatus = bHeader.indexOf(RECUR_BOOKING_STATUS_HEADER);
  var idxBsched = bHeader.indexOf(RECUR_BOOKING_SCHEDULE_ID_HEADER);
  var idxBocc = bHeader.indexOf(RECUR_BOOKING_OCCURRENCE_HEADER);
  var idxBdone = bHeader.indexOf(RECUR_BOOKING_COMPLETED_AT_HEADER);
  if (idxBid === -1 || idxBsched === -1 || idxBocc === -1) {
    Logger.log("ERROR: Bookings header row is missing Booking ID / Recurring Schedule ID / Occurrence Number. Aborting scan.");
    return [];
  }

  var proposed = {};
  var openByScheduleId = {};
  for (var b = 1; b < bRows.length; b++) {
    var row = bRows[b];
    var bookingId = String(row[idxBid] || "");
    var scheduleId = String(row[idxBsched] || "");
    var occurrence = Number(row[idxBocc] || 0);
    if (!bookingId || !scheduleId || !(occurrence > 0)) continue; // not a recurring-schedule appointment

    var cancelled = idxBstatus !== -1 && row[idxBstatus] === RECUR_BOOKING_STATUS_CANCELLED;
    var completed = idxBdone !== -1 && !!row[idxBdone];
    if (!cancelled && !completed) openByScheduleId[scheduleId] = true;

    // A recurring initial appointment with no schedule row: needs repair.
    if (occurrence === 1 && scheduleId === bookingId && !(scheduleId in statusById)) {
      proposed[scheduleId] = true;
    }
  }

  for (var id in statusById) {
    if (statusById[id] === RECUR_STATUS_ACTIVE) proposed[id] = true;
    if (statusById[id] === RECUR_STATUS_ENDED && openByScheduleId[id]) proposed[id] = true;
  }
  return Object.keys(proposed);
}

/**
 * Same request shape and secret handling as paymentScheduler.gs: the
 * Vercel Protection Bypass secret goes in a header (never the URL), and
 * PAYMENT_SCHEDULER_SECRET authenticates the scheduler to the route.
 */
function recurCallEndpoint_(endpointUrl, schedulerSecret, bypassSecret, scheduleIds) {
  var headers = { "x-payment-scheduler-secret": schedulerSecret };
  if (bypassSecret) {
    headers["x-vercel-protection-bypass"] = bypassSecret;
  }

  var response = UrlFetchApp.fetch(endpointUrl, {
    method: "post",
    contentType: "application/json",
    headers: headers,
    payload: JSON.stringify({ scheduleIds: scheduleIds }),
    muteHttpExceptions: true,
  });

  var status = response.getResponseCode();
  if (status !== 200) {
    Logger.log("ERROR: recurring reconcile returned status " + status + ": " + response.getContentText());
    return;
  }
  Logger.log("recurring reconcile response: " + response.getContentText());
}

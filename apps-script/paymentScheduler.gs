/**
 * BeLa Cleaning — Payment Scheduler (Milestone 5)
 *
 * Container-bound to the Bookings Google Sheet. Runs on a 15-minute
 * time-driven trigger: scans the Bookings sheet for rows that look due
 * for their automatic scheduled charge, and calls the BeLa payment
 * endpoint (POST /api/payments/process-due) with just their Booking IDs.
 *
 * This script NEVER talks to Stripe directly and NEVER stores a Stripe
 * secret key — it only determines *which* bookings look due from data
 * already in this sheet. The Vercel endpoint independently re-reads each
 * booking's authoritative state before doing anything and is the only
 * thing that ever calls Stripe. See docs/payments.md for the full
 * architecture and the two-secret authentication model used below.
 *
 * ---- One-time setup (see apps-script/README.md for full steps) ----
 * 1. Open Extensions > Apps Script from the Bookings spreadsheet.
 * 2. Paste this file in as a script file.
 * 3. Project Settings > Script Properties, add:
 *      PROCESS_DUE_ENDPOINT_URL     - the stable Preview endpoint URL
 *                                      (no query string / no secrets in it)
 *      PAYMENT_SCHEDULER_SECRET     - matches Vercel's PAYMENT_SCHEDULER_SECRET
 *      VERCEL_PROTECTION_BYPASS     - matches Vercel's Protection Bypass
 *                                      for Automation secret
 * 4. Run createTimeDrivenTrigger() once from the editor (Run menu) and
 *    approve the authorization prompt. This installs the 15-minute
 *    trigger; only needs to be done once.
 */

var BOOKINGS_SHEET_NAME = "Bookings";
var MAX_BOOKING_IDS_PER_REQUEST = 100; // must match app/api/payments/process-due/route.ts

var COL_BOOKING_ID = "Booking ID";
var COL_BOOKING_STATUS = "Booking Status";
var COL_PAYMENT_STATUS = "Payment Status";
var COL_SCHEDULED_CHARGE_AT = "Scheduled Charge At";
var COL_NEXT_PAYMENT_ATTEMPT_AT = "Next Payment Attempt At";

var BOOKING_STATUS_CANCELLED = "Cancelled";
var PAYMENT_STATUS_SCHEDULED = "Scheduled";
var PAYMENT_STATUS_RETRY_SCHEDULED = "Retry Scheduled";

/** One-time setup: installs the 15-minute time-driven trigger. Run manually once from the editor. */
function createTimeDrivenTrigger() {
  var existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === "runPaymentScheduler";
  });
  existing.forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("runPaymentScheduler").timeBased().everyMinutes(15).create();
  Logger.log("Installed 15-minute trigger for runPaymentScheduler.");
}

/** The scheduled entry point — this is what the 15-minute trigger calls. */
function runPaymentScheduler() {
  var props = PropertiesService.getScriptProperties();
  var endpointUrl = props.getProperty("PROCESS_DUE_ENDPOINT_URL");
  var schedulerSecret = props.getProperty("PAYMENT_SCHEDULER_SECRET");
  var bypassSecret = props.getProperty("VERCEL_PROTECTION_BYPASS");

  if (!endpointUrl || !schedulerSecret) {
    Logger.log("ERROR: Missing PROCESS_DUE_ENDPOINT_URL or PAYMENT_SCHEDULER_SECRET script property. Aborting.");
    return;
  }

  var dueBookingIds = findDueBookingIds_();
  if (dueBookingIds.length === 0) {
    Logger.log("No due bookings this run.");
    return;
  }

  Logger.log("Found " + dueBookingIds.length + " due booking(s): " + dueBookingIds.join(", "));

  // Chunked defensively even though a real run is expected to see, at
  // most, a handful of due bookings — matches the server route's own
  // MAX_BOOKING_IDS_PER_REQUEST bound.
  for (var i = 0; i < dueBookingIds.length; i += MAX_BOOKING_IDS_PER_REQUEST) {
    var chunk = dueBookingIds.slice(i, i + MAX_BOOKING_IDS_PER_REQUEST);
    callProcessDueEndpoint_(endpointUrl, schedulerSecret, bypassSecret, chunk);
  }
}

/** Scans the Bookings sheet and returns Booking IDs that look due right now. */
function findDueBookingIds_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BOOKINGS_SHEET_NAME);
  var values = sheet.getDataRange().getValues();
  var header = values[0];

  var idxBookingId = header.indexOf(COL_BOOKING_ID);
  var idxBookingStatus = header.indexOf(COL_BOOKING_STATUS);
  var idxPaymentStatus = header.indexOf(COL_PAYMENT_STATUS);
  var idxScheduledChargeAt = header.indexOf(COL_SCHEDULED_CHARGE_AT);
  var idxNextPaymentAttemptAt = header.indexOf(COL_NEXT_PAYMENT_ATTEMPT_AT);

  if (idxBookingId === -1 || idxPaymentStatus === -1 || idxScheduledChargeAt === -1 || idxNextPaymentAttemptAt === -1) {
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
    if (bookingStatus === BOOKING_STATUS_CANCELLED) continue;

    var paymentStatus = row[idxPaymentStatus];
    var dueAtRaw = null;
    if (paymentStatus === PAYMENT_STATUS_SCHEDULED) {
      dueAtRaw = row[idxScheduledChargeAt];
    } else if (paymentStatus === PAYMENT_STATUS_RETRY_SCHEDULED) {
      dueAtRaw = row[idxNextPaymentAttemptAt];
    } else {
      continue; // not in a due-able state at all
    }

    var dueAt = parseSheetTimestamp_(dueAtRaw);
    if (dueAt && dueAt.getTime() <= now.getTime()) {
      dueIds.push(String(bookingId));
    }
  }

  return dueIds;
}

/**
 * The relevant cells are ISO 8601 UTC strings written by the Vercel app
 * (e.g. "2026-02-15T18:00:00.000Z"), but Sheets may also hand back a JS
 * Date object for a cell it auto-detected as a date/time — handles both.
 */
function parseSheetTimestamp_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === "[object Date]") return value;
  var parsed = new Date(String(value));
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Calls the process-due endpoint. The Vercel Protection Bypass secret is
 * sent as a header here (never a URL query parameter) — Apps Script's
 * UrlFetchApp can set custom headers, so there is no reason to expose the
 * secret in a URL or in this project's execution logs. The separate
 * PAYMENT_SCHEDULER_SECRET header is what the Vercel route itself uses to
 * authenticate that this request really is the scheduler (see
 * lib/booking/server/schedulerAuth.ts) — the two secrets serve different
 * purposes and are never interchangeable.
 */
function callProcessDueEndpoint_(endpointUrl, schedulerSecret, bypassSecret, bookingIds) {
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
    Logger.log("ERROR: process-due returned status " + status + ": " + response.getContentText());
    return;
  }
  Logger.log("process-due response: " + response.getContentText());
}

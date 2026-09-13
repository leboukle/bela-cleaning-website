// SERVER-ONLY API route. Called only by the Google Apps Script reminder
// scheduler (see apps-script/reminderScheduler.gs), on an hourly
// time-driven trigger. Apps Script determines which bookings look due for
// their 72-hour reminder by reading the Bookings sheet directly (it's
// container-bound to it) and sends the candidate booking IDs here; this
// route re-reads each booking's authoritative state independently and
// never trusts anything about due-ness or attempt count asserted by the
// caller — see reminderService.ts for the actual re-validation.
// Authenticated via the same shared-secret header the payment scheduler
// already uses (schedulerAuth.ts) — Milestone 6 amendment reuses this
// mechanism rather than introducing a second one.
import { NextResponse } from "next/server";
import { verifySchedulerRequest, SchedulerAuthError } from "@/lib/booking/server/schedulerAuth";
import { processReminderForBooking } from "@/lib/booking/server/reminderService";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { NotificationService } from "@/lib/booking/server/notificationService";
import { GmailApiTransport } from "@/lib/booking/server/email/gmailTransport";

export const runtime = "nodejs";

const repository = new GoogleSheetsBookingRepository();
const notificationService = new NotificationService(new GmailApiTransport());

// A single scheduler run is expected to see, at most, a handful of due
// bookings — this is a sanity bound against a malformed or abusive
// request, not a realistic operating limit. Matches the payment
// scheduler's own bound.
const MAX_BOOKING_IDS_PER_REQUEST = 100;
const MAX_BODY_BYTES = 20_000;

type ProcessDueRequestBody = { bookingIds?: unknown };

export async function POST(request: Request) {
  try {
    verifySchedulerRequest(request.headers);
  } catch (error) {
    if (error instanceof SchedulerAuthError) {
      return NextResponse.json({ ok: false, code: "unauthorized", message: "Invalid or missing scheduler credentials." }, { status: 401 });
    }
    throw error;
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, code: "payload-too-large", message: "Request body is too large." }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ ok: false, code: "invalid-json", message: "Invalid request body." }, { status: 400 });
  }

  let body: ProcessDueRequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, code: "invalid-json", message: "Invalid request body." }, { status: 400 });
  }

  const bookingIds = body.bookingIds;
  if (!Array.isArray(bookingIds) || bookingIds.some((id) => typeof id !== "string" || id.length === 0)) {
    return NextResponse.json({ ok: false, code: "validation", message: "bookingIds must be a non-empty array of strings." }, { status: 422 });
  }
  if (bookingIds.length === 0) {
    return NextResponse.json({ ok: true, results: [] }, { status: 200 });
  }
  if (bookingIds.length > MAX_BOOKING_IDS_PER_REQUEST) {
    return NextResponse.json(
      { ok: false, code: "validation", message: `No more than ${MAX_BOOKING_IDS_PER_REQUEST} booking IDs per request.` },
      { status: 422 },
    );
  }

  const now = new Date();
  const results = [];
  // Sequential, not parallel — same rationale as the payment scheduler
  // route: keeps Sheets API usage well within quota and avoids
  // interleaving one booking's read-then-write sequence with another's.
  for (const bookingId of bookingIds) {
    try {
      const outcome = await processReminderForBooking(bookingId, repository, notificationService, now);
      results.push(outcome);
    } catch (error) {
      console.error(`[api/reminders/process-due] unhandled error: bookingId=${bookingId}`, error instanceof Error ? error.message : "unknown error");
      results.push({ bookingId, outcome: "error" as const });
    }
  }

  return NextResponse.json({ ok: true, results }, { status: 200 });
}

// SERVER-ONLY API route. Called only by the Google Apps Script scheduler
// (see apps-script/paymentScheduler.gs), on a 15-minute time-driven
// trigger. Apps Script determines which bookings look due by reading the
// Bookings sheet directly (it's container-bound to it) and sends the
// candidate booking IDs here; this route re-reads each booking's
// authoritative state independently and never trusts anything about
// amount, timing, or eligibility asserted by the caller — see
// paymentProcessingService.ts for the actual re-validation and Stripe
// call. Authenticated via a shared-secret header (schedulerAuth.ts), never
// by the separate Vercel Protection Bypass mechanism, which only gets the
// request past Preview Deployment Protection and proves nothing about who
// is calling.
import { NextResponse } from "next/server";
import { verifySchedulerRequest, SchedulerAuthError } from "@/lib/booking/server/schedulerAuth";
import { processDueBooking } from "@/lib/booking/server/paymentProcessingService";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { NotificationService } from "@/lib/booking/server/notificationService";
import { GmailApiTransport } from "@/lib/booking/server/email/gmailTransport";

export const runtime = "nodejs";

const repository = new GoogleSheetsBookingRepository();
const notificationService = new NotificationService(new GmailApiTransport());

// A single scheduler run is expected to see, at most, a handful of due
// bookings — this is a sanity bound against a malformed or abusive
// request, not a realistic operating limit.
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
  // Sequential, not parallel: keeps Sheets API usage well within its
  // per-100-second quota even if a scheduler run reports the maximum
  // number of due bookings, and keeps each booking's Processing-mark ->
  // Stripe-call sequence from interleaving with another's.
  for (const bookingId of bookingIds) {
    try {
      const outcome = await processDueBooking(bookingId, repository, notificationService, now);
      results.push(outcome);
    } catch (error) {
      console.error(`[api/payments/process-due] unhandled error: bookingId=${bookingId}`, error instanceof Error ? error.message : "unknown error");
      results.push({ bookingId, outcome: "error" as const });
    }
  }

  return NextResponse.json({ ok: true, results }, { status: 200 });
}

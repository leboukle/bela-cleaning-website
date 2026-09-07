// SERVER-ONLY API route. Customer self-service cancellation via a Manage
// Booking token. All sequencing, timing, and fee-calculation rules live in
// cancellationService.ts (never trust a client-supplied fee amount or
// "more than 24 hours" claim) — this file only maps its typed, idempotent
// result onto an HTTP response. Every outcome that leaves the booking in a
// final Cancelled state (free, fee-initiated, fee already resolved, or fee
// submission failed) is reported as success: the cancellation itself always
// succeeds once recorded, independent of whether the fee charge did.
import { NextResponse } from "next/server";
import { cancelBookingByToken, type CancelBookingOutcome } from "@/lib/booking/server/cancellationService";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { NotificationService } from "@/lib/booking/server/notificationService";
import { GmailApiTransport } from "@/lib/booking/server/email/gmailTransport";
import { isRateLimited } from "@/lib/booking/server/rateLimit";

export const runtime = "nodejs";

const repository = new GoogleSheetsBookingRepository();
const notificationService = new NotificationService(new GmailApiTransport());

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  return `manage-booking-cancel:${ip}`;
}

const MESSAGE_BY_OUTCOME: Record<CancelBookingOutcome, string> = {
  "invalid-token": "This booking link is invalid or has expired.",
  "not-eligible": "This booking can no longer be cancelled online. Please contact BeLa Cleaning for help.",
  "already-cancelled-no-charge": "This booking is already cancelled. No charge was made.",
  "fee-already-paid": "This booking is already cancelled and the late-cancellation fee has been charged.",
  "fee-already-failed":
    "This booking is cancelled. We were unable to process the late-cancellation fee — BeLa Cleaning will follow up with you directly.",
  "fee-processing": "This booking is cancelled. Your late-cancellation fee is being processed.",
  "cancelled-free": "Your booking has been cancelled. No charge was made.",
  "cancelled-fee-initiated": "Your booking has been cancelled. The late-cancellation fee is being processed.",
  "cancelled-fee-submission-failed":
    "Your booking has been cancelled. We were unable to process the late-cancellation fee right now — BeLa Cleaning will follow up with you directly.",
};

const STATUS_BY_OUTCOME: Record<CancelBookingOutcome, number> = {
  "invalid-token": 404,
  "not-eligible": 409,
  "already-cancelled-no-charge": 200,
  "fee-already-paid": 200,
  "fee-already-failed": 200,
  "fee-processing": 200,
  "cancelled-free": 200,
  "cancelled-fee-initiated": 200,
  "cancelled-fee-submission-failed": 200,
};

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait a moment and try again." }, { status: 429 });
  }

  const { token } = await context.params;

  try {
    const result = await cancelBookingByToken(token, repository, notificationService);
    return NextResponse.json(
      { ok: STATUS_BY_OUTCOME[result.outcome] < 400, outcome: result.outcome, message: MESSAGE_BY_OUTCOME[result.outcome] },
      { status: STATUS_BY_OUTCOME[result.outcome] },
    );
  } catch (error) {
    console.error("[api/manage-booking/cancel] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to process this cancellation right now. Please try again." }, { status: 500 });
  }
}

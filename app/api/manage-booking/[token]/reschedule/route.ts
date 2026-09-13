// SERVER-ONLY API route. Customer self-service rescheduling via a Manage
// Booking token. All validation (timing, lead time, live availability) and
// the atomic update live in reschedulingService.ts — this file only parses
// a bounded JSON body and maps the typed result onto an HTTP response.
import { NextResponse } from "next/server";
import { rescheduleBookingByToken, type RescheduleBookingOutcome } from "@/lib/booking/server/reschedulingService";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { NotificationService } from "@/lib/booking/server/notificationService";
import { GmailApiTransport } from "@/lib/booking/server/email/gmailTransport";
import { isRateLimited } from "@/lib/booking/server/rateLimit";

export const runtime = "nodejs";

const repository = new GoogleSheetsBookingRepository();
const notificationService = new NotificationService(new GmailApiTransport());

const MAX_BODY_BYTES = 2_000;

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  return `manage-booking-reschedule:${ip}`;
}

const MESSAGE_BY_OUTCOME: Record<RescheduleBookingOutcome, string> = {
  "invalid-token": "This booking link is invalid or has expired.",
  "not-eligible": "This booking can no longer be rescheduled online. Please contact BeLa Cleaning for help.",
  "invalid-input": "Please choose a valid date and appointment time.",
  "date-unavailable": "That date and time is no longer available. Please choose another.",
  rescheduled: "Your booking has been rescheduled.",
};

const STATUS_BY_OUTCOME: Record<RescheduleBookingOutcome, number> = {
  "invalid-token": 404,
  "not-eligible": 409,
  "invalid-input": 422,
  "date-unavailable": 409,
  rescheduled: 200,
};

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait a moment and try again." }, { status: 429 });
  }

  const { token } = await context.params;

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, message: "Request body is too large." }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, message: "Request body is too large." }, { status: 413 });
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }
  if (typeof input !== "object" || input === null) {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }
  const { serviceDate, serviceStartTime } = input as { serviceDate?: unknown; serviceStartTime?: unknown };
  if (typeof serviceDate !== "string" || typeof serviceStartTime !== "string") {
    return NextResponse.json({ ok: false, message: "Please choose a valid date and appointment time." }, { status: 422 });
  }

  try {
    const result = await rescheduleBookingByToken(token, serviceDate, serviceStartTime, repository, notificationService);
    return NextResponse.json(
      {
        ok: STATUS_BY_OUTCOME[result.outcome] < 400,
        outcome: result.outcome,
        message: MESSAGE_BY_OUTCOME[result.outcome],
        serviceDate: result.serviceDate,
        serviceStartTime: result.serviceStartTime,
      },
      { status: STATUS_BY_OUTCOME[result.outcome] },
    );
  } catch (error) {
    console.error("[api/manage-booking/reschedule] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to process this reschedule right now. Please try again." }, { status: 500 });
  }
}

// SERVER-ONLY API route. Accepts a booking submission and delegates
// everything (validation, availability, pricing, idempotency, persistence)
// to bookingService.ts — this file's only job is HTTP plumbing: parsing a
// bounded request body, applying best-effort rate limiting, and mapping
// the typed result onto an HTTP status code.
import { NextResponse } from "next/server";
import { submitBooking } from "@/lib/booking/server/bookingService";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { NotificationService } from "@/lib/booking/server/notificationService";
import { GmailApiTransport } from "@/lib/booking/server/email/gmailTransport";
import { isRateLimited } from "@/lib/booking/server/rateLimit";
import type { BookingSubmissionInput } from "@/lib/booking/server/types";

export const runtime = "nodejs";

// Reused across invocations on a warm instance; holds no per-request state.
const repository = new GoogleSheetsBookingRepository();
const notificationService = new NotificationService(new GmailApiTransport());

// Generous bound for a JSON booking payload (well above any legitimate
// booking's serialized size) — rejects abusive oversized bodies outright.
const MAX_BODY_BYTES = 20_000;

const STATUS_BY_FAILURE_CODE = {
  validation: 422,
  "date-unavailable": 409,
  "payment-setup-invalid": 422,
  "server-error": 500,
} as const;

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  return `submit:${ip}`;
}

export async function POST(request: Request) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json(
      { ok: false, code: "rate-limited", message: "Too many requests. Please wait a moment and try again." },
      { status: 429 },
    );
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
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, code: "payload-too-large", message: "Request body is too large." }, { status: 413 });
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, code: "invalid-json", message: "Invalid request body." }, { status: 400 });
  }
  if (typeof input !== "object" || input === null) {
    return NextResponse.json({ ok: false, code: "invalid-json", message: "Invalid request body." }, { status: 400 });
  }

  const result = await submitBooking(input as BookingSubmissionInput, repository, notificationService);
  if (result.ok) {
    return NextResponse.json(result, { status: 201 });
  }
  return NextResponse.json(result, { status: STATUS_BY_FAILURE_CODE[result.code] });
}

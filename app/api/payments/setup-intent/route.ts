// SERVER-ONLY API route. Phase 1 of the two-phase booking submission: the
// browser calls this once the customer reaches the Payment step, and gets
// back a Stripe client_secret to mount PaymentElement in setup mode. No
// card data ever reaches this route — Stripe's client-side SDK collects it
// directly. The booking itself isn't created or persisted here; that only
// happens at final /api/booking submission, which re-verifies the
// SetupIntent this route creates before trusting it.
import { NextResponse } from "next/server";
import { createBookingSetupIntent } from "@/lib/booking/server/stripe/setupIntent";
import { isRateLimited } from "@/lib/booking/server/rateLimit";
import { isValidEmail, isValidUsPhone, isNonEmpty } from "@/lib/booking/validation";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2_000;

type SetupIntentRequestBody = {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  return `setup-intent:${ip}`;
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

  let body: SetupIntentRequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, code: "invalid-json", message: "Invalid request body." }, { status: 400 });
  }

  const firstName = asTrimmedString(body.firstName);
  const lastName = asTrimmedString(body.lastName);
  const email = asTrimmedString(body.email);
  const phone = asTrimmedString(body.phone);

  if (!isNonEmpty(firstName) || !isNonEmpty(lastName) || !isValidEmail(email) || !isValidUsPhone(phone)) {
    return NextResponse.json(
      { ok: false, code: "validation", message: "A valid name, email, and phone number are required." },
      { status: 422 },
    );
  }

  try {
    const result = await createBookingSetupIntent({ firstName, lastName, email, phone });
    return NextResponse.json({ ok: true, clientSecret: result.clientSecret, setupIntentId: result.setupIntentId }, { status: 201 });
  } catch (error) {
    console.error("[api/payments/setup-intent] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json(
      { ok: false, code: "server-error", message: "We're temporarily unable to set up payment. Please try again shortly." },
      { status: 500 },
    );
  }
}

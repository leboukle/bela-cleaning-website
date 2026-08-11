// SERVER-ONLY. Authenticates inbound requests that claim to come from the
// Google Apps Script scheduler. Apps Script sends the shared secret as a
// header (PAYMENT_SCHEDULER_SECRET, matched here against the same-named
// env var) — never as a URL query parameter, so it never ends up in
// server logs or the Vercel bypass URL. This is a separate concern from
// Vercel's own "Protection Bypass for Automation": that header
// (x-vercel-protection-bypass) gets the request *past* Preview
// Deployment Protection, while this header authenticates that the
// request is actually the scheduler and not an arbitrary caller who also
// knows the bypass secret.
import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getPaymentSchedulerSecret } from "./stripe/stripeConfig";

const SCHEDULER_SECRET_HEADER = "x-payment-scheduler-secret";

export class SchedulerAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchedulerAuthError";
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Throws SchedulerAuthError if the request's shared-secret header is missing or wrong. */
export function verifySchedulerRequest(headers: Headers): void {
  const provided = headers.get(SCHEDULER_SECRET_HEADER);
  if (!provided) {
    throw new SchedulerAuthError(`Missing ${SCHEDULER_SECRET_HEADER} header.`);
  }

  const expected = getPaymentSchedulerSecret();
  if (!constantTimeEquals(provided, expected)) {
    throw new SchedulerAuthError("Scheduler secret does not match.");
  }
}

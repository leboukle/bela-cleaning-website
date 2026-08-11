// SERVER-ONLY. Classifies a failed Stripe PaymentIntent into one of three
// buckets, per the classification approved before implementation (see
// docs/payments.md's retry policy section for the full rationale — this
// file is the single source of truth the approved table maps onto, so
// there is exactly one place to update if Stripe adds a new code or the
// business wants to reclassify one).
import "server-only";
import type { PaymentIntentFailureDetail } from "./paymentIntent";

export type FailureClassification = "retryable" | "non-retryable" | "requires-action";

// Transient — another attempt may reasonably succeed.
const RETRYABLE_DECLINE_CODES = new Set([
  "insufficient_funds",
  "try_again_later",
  "issuer_not_available",
  "processing_error",
  "card_velocity_exceeded",
  "approve_with_id",
  "generic_decline",
  "do_not_honor",
]);

// Hard declines / fraud signals — retrying the identical saved card will
// fail identically or is inappropriate to attempt again automatically.
const NON_RETRYABLE_DECLINE_CODES = new Set([
  "lost_card",
  "stolen_card",
  "pickup_card",
  "restricted_card",
  "revocation_of_all_authorizations",
  "security_violation",
  "fraudulent",
  "merchant_blacklist",
]);

// Stale/incorrect saved payment-method data — the customer needs to
// update their card, a blind scheduler retry can never succeed.
const NON_RETRYABLE_CODES = new Set([
  "expired_card",
  "incorrect_cvc",
  "invalid_cvc",
  "incorrect_number",
  "invalid_number",
  "incorrect_zip",
  "invalid_expiry_month",
  "invalid_expiry_year",
  "card_not_supported",
  "currency_not_supported",
]);

/**
 * Classifies a failed/off-session PaymentIntent outcome. Falls back to
 * "retryable" for any code not explicitly recognized (bounded by the same
 * approved 4-attempt cadence, never indefinite) — the caller is expected
 * to also flag unrecognized codes for review rather than silently
 * absorbing them into a bucket forever. See
 * lib/booking/server/stripe/paymentFailureClassification.test.ts for the
 * exact approved code -> bucket mapping.
 */
export function classifyPaymentFailure(detail: PaymentIntentFailureDetail): {
  classification: FailureClassification;
  recognized: boolean;
} {
  if (detail.code === "authentication_required") {
    return { classification: "requires-action", recognized: true };
  }

  if (detail.declineCode && RETRYABLE_DECLINE_CODES.has(detail.declineCode)) {
    return { classification: "retryable", recognized: true };
  }
  if (detail.declineCode && NON_RETRYABLE_DECLINE_CODES.has(detail.declineCode)) {
    return { classification: "non-retryable", recognized: true };
  }
  if (detail.code && NON_RETRYABLE_CODES.has(detail.code)) {
    return { classification: "non-retryable", recognized: true };
  }
  if (detail.type === "invalid_request_error") {
    return { classification: "non-retryable", recognized: true };
  }
  if (detail.type === "api_error") {
    return { classification: "retryable", recognized: true };
  }

  // Unrecognized code (or a generic decline with no decline_code at all):
  // fail safe as retryable within the bounded cadence rather than giving
  // up immediately on something we don't have an explicit rule for yet.
  return { classification: "retryable", recognized: false };
}

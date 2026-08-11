// SERVER-ONLY. Creates the off-session PaymentIntent that actually moves
// money, at the scheduled charge time. Only ever called from
// process-due's endpoint, after that endpoint has independently re-read
// and re-validated the authoritative booking state — this module trusts
// its caller for the amount/IDs, so it must never be called with anything
// sourced directly from an untrusted request.
import "server-only";
import { getStripeClient } from "./stripeConfig";

export type CreateOffSessionPaymentIntentInput = {
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  bookingId: string;
  serviceDate: string;
  idempotencyKey: string;
};

export type PaymentIntentOutcome =
  | { outcome: "succeeded"; paymentIntentId: string }
  | { outcome: "requires_action"; paymentIntentId: string }
  | { outcome: "failed"; paymentIntentId: string | null; error: PaymentIntentFailureDetail };

export type PaymentIntentFailureDetail = {
  type: string | null;
  code: string | null;
  declineCode: string | null;
};

const ENVIRONMENT = process.env.VERCEL_ENV ?? "development";

/**
 * Creates and confirms an off-session PaymentIntent in one call
 * (confirm: true). Uses Stripe's own idempotency-key mechanism (not a
 * bespoke one) — the same idempotency key passed for a retried scheduler
 * call returns Stripe's original result instead of creating a second
 * PaymentIntent, exactly like every other duplicate-scheduler-call
 * scenario this milestone needs to be safe against.
 */
export async function createOffSessionPaymentIntent(
  input: CreateOffSessionPaymentIntentInput,
): Promise<PaymentIntentOutcome> {
  const stripe = getStripeClient();

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: "usd",
        customer: input.customerId,
        payment_method: input.paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          bookingId: input.bookingId,
          serviceDate: input.serviceDate,
          environment: ENVIRONMENT,
        },
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (paymentIntent.status === "succeeded") {
      return { outcome: "succeeded", paymentIntentId: paymentIntent.id };
    }
    if (paymentIntent.status === "requires_action") {
      return { outcome: "requires_action", paymentIntentId: paymentIntent.id };
    }
    // Any other non-succeeded status reaching here without throwing is
    // treated as a failure needing classification, same as a thrown
    // StripeCardError below.
    return {
      outcome: "failed",
      paymentIntentId: paymentIntent.id,
      error: { type: null, code: null, declineCode: null },
    };
  } catch (error) {
    return { outcome: "failed", paymentIntentId: extractPaymentIntentId(error), error: extractFailureDetail(error) };
  }
}

function extractPaymentIntentId(error: unknown): string | null {
  if (error && typeof error === "object" && "payment_intent" in error) {
    const pi = (error as { payment_intent?: { id?: string } }).payment_intent;
    return pi?.id ?? null;
  }
  return null;
}

function extractFailureDetail(error: unknown): PaymentIntentFailureDetail {
  if (error && typeof error === "object") {
    const err = error as { type?: string; code?: string; decline_code?: string };
    return { type: err.type ?? null, code: err.code ?? null, declineCode: err.decline_code ?? null };
  }
  return { type: null, code: null, declineCode: null };
}

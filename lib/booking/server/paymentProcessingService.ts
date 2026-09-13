// SERVER-ONLY. Orchestrates one payment-processing attempt for one
// booking, called by app/api/payments/process-due/route.ts once per due
// booking ID the Apps Script scheduler reports. Mirrors bookingService.ts's
// role: the route is thin HTTP plumbing, this module is where the actual
// sequencing and business rules live, so it can be unit-tested without a
// real HTTP request.
//
// Deliberately does NOT resolve final payment status (Paid / Retry
// Scheduled / Final Failure / Requires Action) for any attempt that
// actually reaches Stripe — that is paymentWebhookService.ts's job
// exclusively, since the Stripe webhook is the approved, authoritative
// source for payment results (see docs/payments.md). The one exception is
// the case handled at the bottom of processDueBooking: an attempt that
// never produced a Stripe PaymentIntent at all (a connectivity/infra
// failure, not a card decline) has no PaymentIntent for a webhook to ever
// report on, so this module must resolve and notify for that case itself.
import "server-only";
import { BOOKING_STATUS, PAYMENT_STATUS } from "./bookingsSheetSchema";
import { createOffSessionPaymentIntent, retrievePaymentIntent, type PaymentIntentOutcome } from "./stripe/paymentIntent";
import type Stripe from "stripe";
import { classifyPaymentFailure } from "./stripe/paymentFailureClassification";
import { getNextRetryAt, MAX_PAYMENT_ATTEMPTS } from "./paymentRetryCadence";
import type { NotificationService } from "./notificationService";
import type { BookingRepository } from "./repository";
import type { BookingPaymentState } from "./types";
import { formatOperationalTimestamp } from "./dateUtils";

export type PaymentAttemptNotificationSender = Pick<NotificationService, "sendInternalPaymentFailed">;

export type ProcessDueOutcome =
  | { bookingId: string; outcome: "not-found" }
  | { bookingId: string; outcome: "skipped-cancelled" }
  | { bookingId: string; outcome: "skipped-not-due"; paymentStatus: string }
  | { bookingId: string; outcome: "skipped-not-yet-due" }
  | { bookingId: string; outcome: "skipped-missing-payment-method" }
  | { bookingId: string; outcome: "skipped-already-paid"; paymentIntentId: string }
  | { bookingId: string; outcome: "skipped-payment-intent-in-progress"; paymentIntentId: string; stripeStatus: string }
  | { bookingId: string; outcome: "skipped-payment-intent-lookup-failed"; paymentIntentId: string }
  | { bookingId: string; outcome: "charge-initiated"; paymentIntentId: string; stripeOutcome: PaymentIntentOutcome["outcome"] }
  | { bookingId: string; outcome: "failed-terminal"; paymentStatus: string };

// A recorded PaymentIntent in one of these statuses has positively and
// terminally NOT succeeded — Stripe will never move it to "succeeded" from
// here, so it is safe for the existing retry logic below to create a
// brand-new PaymentIntent for the next attempt. Every other non-succeeded
// status (processing, requires_action, requires_capture,
// requires_confirmation) means Stripe may still independently complete
// this exact PaymentIntent — creating a second one in that window risks
// the customer being charged twice, so those are treated as "still in
// progress" and deferred to a later scheduler run instead.
const RETRYABLE_TERMINAL_PAYMENT_INTENT_STATUSES = new Set<Stripe.PaymentIntent.Status>(["requires_payment_method", "canceled"]);

function isDue(state: BookingPaymentState, now: Date): boolean {
  const dueAtIso = state.paymentStatus === PAYMENT_STATUS.SCHEDULED ? state.scheduledChargeAt : state.nextPaymentAttemptAt;
  if (!dueAtIso) return false;
  const dueAt = new Date(dueAtIso);
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() <= now.getTime();
}

function logError(step: string, bookingId: string, error: unknown): void {
  console.error(`[paymentProcessingService] ${step} failed: bookingId=${bookingId}`, error instanceof Error ? error.message : "unknown error");
}

export async function processDueBooking(
  bookingId: string,
  repository: BookingRepository,
  notifications: PaymentAttemptNotificationSender,
  now: Date = new Date(),
): Promise<ProcessDueOutcome> {
  const state = await repository.getBookingPaymentState(bookingId);
  if (!state) return { bookingId, outcome: "not-found" };
  if (state.bookingStatus === BOOKING_STATUS.CANCELLED) return { bookingId, outcome: "skipped-cancelled" };

  const isScheduled = state.paymentStatus === PAYMENT_STATUS.SCHEDULED;
  const isRetryScheduled = state.paymentStatus === PAYMENT_STATUS.RETRY_SCHEDULED;
  if (!isScheduled && !isRetryScheduled) {
    return { bookingId, outcome: "skipped-not-due", paymentStatus: state.paymentStatus };
  }
  if (!isDue(state, now)) return { bookingId, outcome: "skipped-not-yet-due" };
  if (!state.stripeCustomerId || !state.stripePaymentMethodId) {
    return { bookingId, outcome: "skipped-missing-payment-method" };
  }

  // Idempotency guard, independent of the Sheet's own Payment Status: the
  // status check above (Scheduled/Retry Scheduled) is only as reliable as
  // that field, which can go stale if a webhook delivery for an earlier
  // attempt was ever missed — that would otherwise leave an already-paid
  // booking permanently retryable, repeatedly re-attempting a real charge
  // against Stripe and repeatedly re-sending failed-payment notifications
  // built from stale error/retry fields. If this booking has a
  // PaymentIntent on file, verify its actual current status directly with
  // Stripe before ever charging again — never fall through to a new charge
  // just because the lookup was inconclusive.
  if (state.stripePaymentIntentId) {
    const existing = await retrievePaymentIntent(state.stripePaymentIntentId);

    // The lookup itself failed (Stripe/API/network error) — fail CLOSED.
    // A transient lookup failure must never be treated as "safe to charge
    // again": that would turn a temporary Stripe outage into a duplicate-
    // charge opportunity. Leave every field untouched and defer; the next
    // scheduler run re-checks Stripe from scratch.
    if (!existing) {
      return { bookingId, outcome: "skipped-payment-intent-lookup-failed", paymentIntentId: state.stripePaymentIntentId };
    }

    if (existing.status === "succeeded") {
      // Self-heals the Sheet back to Paid (clearing every retry-only
      // field, not just skipping) so the row converges to reality and a
      // stuck retry can't keep generating failure notifications forever.
      try {
        await repository.updatePaymentAttempt(bookingId, {
          paymentStatus: PAYMENT_STATUS.PAID,
          stripePaymentIntentId: existing.id,
          paidAt: formatOperationalTimestamp(now),
          paymentAttemptCount: state.paymentAttemptCount,
          lastPaymentAttemptAt: formatOperationalTimestamp(now),
          nextPaymentAttemptAt: "",
          paymentFailureCode: "",
        });
      } catch (error) {
        logError("updatePaymentAttempt (idempotency self-heal to Paid)", bookingId, error);
      }
      return { bookingId, outcome: "skipped-already-paid", paymentIntentId: existing.id };
    }

    if (!RETRYABLE_TERMINAL_PAYMENT_INTENT_STATUSES.has(existing.status)) {
      // Stripe has not positively established that the prior attempt is
      // over — e.g. still "processing", or "requires_action"/
      // "requires_capture"/"requires_confirmation" — so this existing
      // PaymentIntent could still independently resolve to succeeded.
      // Do not create a second one; leave the Sheet untouched and defer
      // to a later scheduler run.
      return { bookingId, outcome: "skipped-payment-intent-in-progress", paymentIntentId: existing.id, stripeStatus: existing.status };
    }

    // existing.status is "requires_payment_method" or "canceled" — Stripe
    // has positively confirmed the prior attempt is over and did not
    // succeed, so it's safe to fall through into the existing retry logic
    // below, which creates a fresh PaymentIntent under a new idempotency
    // key.
  }

  const attemptNumber = state.paymentAttemptCount + 1;
  // Manual Amount Override (if BeLa staff set one directly in the sheet)
  // already lives in Charge Amount — this is always the authoritative
  // figure to charge, never re-derived or re-trusted from anywhere else.
  const amountCents = Math.round(state.chargeAmount * 100);

  // Marked Processing, with the attempt bumped, before calling Stripe —
  // narrows (does not eliminate) the window in which an overlapping
  // scheduler run could double-attempt the same booking; the real
  // duplicate-charge defense is the Stripe idempotency key below.
  try {
    await repository.updatePaymentAttempt(bookingId, {
      paymentStatus: PAYMENT_STATUS.PROCESSING,
      stripePaymentIntentId: "",
      paidAt: "",
      paymentAttemptCount: attemptNumber,
      lastPaymentAttemptAt: formatOperationalTimestamp(now),
      nextPaymentAttemptAt: "",
      paymentFailureCode: "",
    });
  } catch (error) {
    logError("updatePaymentAttempt (mark Processing)", bookingId, error);
    throw error;
  }

  const idempotencyKey = `charge:${bookingId}:attempt:${attemptNumber}`;
  const result = await createOffSessionPaymentIntent({
    customerId: state.stripeCustomerId,
    paymentMethodId: state.stripePaymentMethodId,
    amountCents,
    bookingId,
    serviceDate: state.serviceDate,
    idempotencyKey,
  });

  // "succeeded" and "requires_action" always carry a PaymentIntent ID;
  // "failed" carries one only if Stripe actually created/attempted the
  // object before declining it (a real card decline) — narrowing on the
  // literal `outcome` first (rather than truthiness of paymentIntentId)
  // is what lets TypeScript see that, so the fallthrough below is
  // guaranteed to be the "failed" variant.
  if (result.outcome === "succeeded" || result.outcome === "requires_action" || result.paymentIntentId) {
    // A real Stripe PaymentIntent exists for this attempt — Stripe will
    // deliver payment_intent.succeeded or payment_intent.payment_failed,
    // which is authoritative. Record the ID for visibility only; leave
    // status resolution entirely to the webhook.
    const paymentIntentId = result.paymentIntentId as string;
    try {
      await repository.updatePaymentAttempt(bookingId, {
        paymentStatus: PAYMENT_STATUS.PROCESSING,
        stripePaymentIntentId: paymentIntentId,
        paidAt: "",
        paymentAttemptCount: attemptNumber,
        lastPaymentAttemptAt: formatOperationalTimestamp(now),
        nextPaymentAttemptAt: "",
        paymentFailureCode: "",
      });
    } catch (error) {
      logError("updatePaymentAttempt (record PaymentIntent ID)", bookingId, error);
    }
    return { bookingId, outcome: "charge-initiated", paymentIntentId, stripeOutcome: result.outcome };
  }

  // No PaymentIntent was ever created at Stripe (a connectivity/infra
  // failure, not a card decline) — no webhook will ever arrive for this
  // attempt, so this module must resolve terminal state and notify BeLa
  // itself, the one exception to "the webhook is the sole writer."
  const { classification } = classifyPaymentFailure(result.error);
  let paymentStatus: string = PAYMENT_STATUS.FINAL_FAILURE;
  let nextPaymentAttemptAt = "";
  if (classification === "requires-action") {
    paymentStatus = PAYMENT_STATUS.REQUIRES_ACTION;
  } else if (classification === "retryable" && attemptNumber < MAX_PAYMENT_ATTEMPTS) {
    const nextAt = getNextRetryAt(attemptNumber, now);
    paymentStatus = PAYMENT_STATUS.RETRY_SCHEDULED;
    nextPaymentAttemptAt = nextAt ? nextAt.toISOString() : "";
  }

  try {
    await repository.updatePaymentAttempt(bookingId, {
      paymentStatus,
      stripePaymentIntentId: "",
      paidAt: "",
      paymentAttemptCount: attemptNumber,
      lastPaymentAttemptAt: formatOperationalTimestamp(now),
      nextPaymentAttemptAt,
      paymentFailureCode: result.error.code ?? result.error.type ?? "unknown_error",
    });
  } catch (error) {
    logError("updatePaymentAttempt (terminal, no PaymentIntent)", bookingId, error);
  }

  try {
    const record = await repository.getFullBookingRecord(bookingId);
    if (record) {
      await notifications.sendInternalPaymentFailed(
        { ...record, paymentStatus, nextPaymentAttemptAt, paymentAttemptCount: attemptNumber },
        { classification, failure: result.error },
      );
    }
  } catch (error) {
    logError("sendInternalPaymentFailed", bookingId, error);
  }

  return { bookingId, outcome: "failed-terminal", paymentStatus };
}

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
import { createOffSessionPaymentIntent, type PaymentIntentOutcome } from "./stripe/paymentIntent";
import { classifyPaymentFailure } from "./stripe/paymentFailureClassification";
import { getNextRetryAt, MAX_PAYMENT_ATTEMPTS } from "./paymentRetryCadence";
import type { NotificationService } from "./notificationService";
import type { BookingRepository } from "./repository";
import type { BookingPaymentState } from "./types";

export type PaymentAttemptNotificationSender = Pick<NotificationService, "sendInternalPaymentFailed">;

export type ProcessDueOutcome =
  | { bookingId: string; outcome: "not-found" }
  | { bookingId: string; outcome: "skipped-cancelled" }
  | { bookingId: string; outcome: "skipped-not-due"; paymentStatus: string }
  | { bookingId: string; outcome: "skipped-not-yet-due" }
  | { bookingId: string; outcome: "skipped-missing-payment-method" }
  | { bookingId: string; outcome: "charge-initiated"; paymentIntentId: string; stripeOutcome: PaymentIntentOutcome["outcome"] }
  | { bookingId: string; outcome: "failed-terminal"; paymentStatus: string };

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
      lastPaymentAttemptAt: now.toISOString(),
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
        lastPaymentAttemptAt: now.toISOString(),
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
      lastPaymentAttemptAt: now.toISOString(),
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

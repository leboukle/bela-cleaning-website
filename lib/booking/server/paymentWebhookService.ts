// SERVER-ONLY. Handles the two Stripe webhook events this milestone cares
// about (payment_intent.succeeded, payment_intent.payment_failed) — the
// approved, authoritative source for payment results (see
// paymentProcessingService.ts's header comment and docs/payments.md).
// app/api/payments/webhook/route.ts verifies the Stripe signature and
// dispatches here; everything below assumes the event is genuinely from
// Stripe.
import "server-only";
import { PAYMENT_STATUS } from "./bookingsSheetSchema";
import { classifyPaymentFailure } from "./stripe/paymentFailureClassification";
import type { PaymentIntentFailureDetail } from "./stripe/paymentIntent";
import { getNextRetryAt, MAX_PAYMENT_ATTEMPTS } from "./paymentRetryCadence";
import type { NotificationService } from "./notificationService";
import type { BookingRepository } from "./repository";
import type Stripe from "stripe";

export type PaymentWebhookNotificationSender = Pick<
  NotificationService,
  "sendPaymentReceipt" | "sendInternalPaymentSucceeded" | "sendInternalPaymentFailed"
>;

function logError(step: string, bookingId: string, error: unknown): void {
  console.error(`[paymentWebhookService] ${step} failed: bookingId=${bookingId}`, error instanceof Error ? error.message : "unknown error");
}

function extractBookingId(paymentIntent: Stripe.PaymentIntent): string | null {
  const bookingId = paymentIntent.metadata?.bookingId;
  return typeof bookingId === "string" && bookingId.length > 0 ? bookingId : null;
}

export async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  repository: BookingRepository,
  notifications: PaymentWebhookNotificationSender,
  now: Date = new Date(),
): Promise<void> {
  const bookingId = extractBookingId(paymentIntent);
  if (!bookingId) {
    console.error(`[paymentWebhookService] payment_intent.succeeded missing metadata.bookingId: ${paymentIntent.id}`);
    return;
  }

  const state = await repository.getBookingPaymentState(bookingId);
  if (!state) {
    console.error(`[paymentWebhookService] payment_intent.succeeded for unknown booking: ${bookingId}`);
    return;
  }

  // Idempotent: Stripe may redeliver the same event. If this booking is
  // already Paid, do nothing further — never re-send the receipt or
  // overwrite paidAt with a later delivery's timestamp.
  if (state.paymentStatus === PAYMENT_STATUS.PAID) return;

  try {
    await repository.updatePaymentAttempt(bookingId, {
      paymentStatus: PAYMENT_STATUS.PAID,
      stripePaymentIntentId: paymentIntent.id,
      paidAt: now.toISOString(),
      paymentAttemptCount: state.paymentAttemptCount,
      lastPaymentAttemptAt: now.toISOString(),
      nextPaymentAttemptAt: "",
      paymentFailureCode: "",
    });
  } catch (error) {
    logError("updatePaymentAttempt (Paid)", bookingId, error);
    throw error; // lets the route return 500 so Stripe retries delivery
  }

  try {
    const record = await repository.getFullBookingRecord(bookingId);
    if (record) {
      await Promise.allSettled([notifications.sendPaymentReceipt(record), notifications.sendInternalPaymentSucceeded(record)]);
    }
  } catch (error) {
    logError("payment success notifications", bookingId, error);
  }
}

export async function handlePaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent,
  repository: BookingRepository,
  notifications: PaymentWebhookNotificationSender,
  now: Date = new Date(),
): Promise<void> {
  const bookingId = extractBookingId(paymentIntent);
  if (!bookingId) {
    console.error(`[paymentWebhookService] payment_intent.payment_failed missing metadata.bookingId: ${paymentIntent.id}`);
    return;
  }

  const state = await repository.getBookingPaymentState(bookingId);
  if (!state) {
    console.error(`[paymentWebhookService] payment_intent.payment_failed for unknown booking: ${bookingId}`);
    return;
  }

  // Idempotent: only resolve an attempt that's still Processing. A
  // redelivered event for an attempt already resolved to Retry
  // Scheduled/Final Failure/Requires Action is a no-op — re-running this
  // would double-schedule a retry or re-notify BeLa for the same failure.
  if (state.paymentStatus !== PAYMENT_STATUS.PROCESSING) return;

  const failure: PaymentIntentFailureDetail = {
    type: paymentIntent.last_payment_error?.type ?? null,
    code: paymentIntent.last_payment_error?.code ?? null,
    declineCode: paymentIntent.last_payment_error?.decline_code ?? null,
  };
  const { classification } = classifyPaymentFailure(failure);

  let paymentStatus: string = PAYMENT_STATUS.FINAL_FAILURE;
  let nextPaymentAttemptAt = "";
  if (classification === "requires-action") {
    paymentStatus = PAYMENT_STATUS.REQUIRES_ACTION;
  } else if (classification === "retryable" && state.paymentAttemptCount < MAX_PAYMENT_ATTEMPTS) {
    const nextAt = getNextRetryAt(state.paymentAttemptCount, now);
    paymentStatus = PAYMENT_STATUS.RETRY_SCHEDULED;
    nextPaymentAttemptAt = nextAt ? nextAt.toISOString() : "";
  }

  try {
    await repository.updatePaymentAttempt(bookingId, {
      paymentStatus,
      stripePaymentIntentId: paymentIntent.id,
      paidAt: "",
      paymentAttemptCount: state.paymentAttemptCount,
      lastPaymentAttemptAt: now.toISOString(),
      nextPaymentAttemptAt,
      paymentFailureCode: failure.code ?? failure.type ?? "unknown_error",
    });
  } catch (error) {
    logError("updatePaymentAttempt (failure)", bookingId, error);
    throw error; // lets the route return 500 so Stripe retries delivery
  }

  // BeLa is notified on every failed attempt, regardless of classification.
  try {
    const record = await repository.getFullBookingRecord(bookingId);
    if (record) {
      await notifications.sendInternalPaymentFailed(
        { ...record, paymentStatus, nextPaymentAttemptAt },
        { classification, failure },
      );
    }
  } catch (error) {
    logError("sendInternalPaymentFailed", bookingId, error);
  }
}

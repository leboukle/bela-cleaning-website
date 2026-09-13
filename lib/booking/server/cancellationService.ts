// SERVER-ONLY. Orchestrates customer self-service cancellation via a
// Manage Booking token — mirrors bookingService.ts/paymentProcessingService.ts's
// role: the API route is thin HTTP plumbing, this module is where the
// actual sequencing and business rules live.
//
// Designed to be fully idempotent and resumable on every call — there is
// exactly one entry point (cancelBookingByToken), and every invocation
// re-reads the booking's current authoritative state and does only
// whatever the next needed step is (including "nothing, already done").
// This is what makes the required recovery behavior fall out naturally
// rather than needing a separate code path: if the process crashes after
// writing "Cancelled + Cancellation Fee Processing" but before ever
// calling Stripe, the booking is left in a state — Booking Status
// Cancelled, Payment Status Cancellation Fee Processing, Stripe Payment
// Intent ID blank — that is fully distinguishable from every other
// possible state, using only the existing Payment Status + Stripe Payment
// Intent ID fields (no new column). A subsequent call to
// cancelBookingByToken() for the same booking — whether triggered by the
// customer clicking again or by the Manage Booking page's own read path
// (see manageBookingView.ts) — recognizes exactly this condition and
// submits the missing PaymentIntent, using the same deterministic
// idempotency key the original attempt would have used, making it safe
// to call any number of times.
import "server-only";
import { BOOKING_STATUS, PAYMENT_STATUS } from "./bookingsSheetSchema";
import { hashManageToken, isPlausibleManageToken } from "./manageToken";
import { getBookingTimingStatus, calculateLateCancellationFeeCents } from "./cancellationPolicy";
import { createOffSessionPaymentIntent, type PaymentIntentFailureDetail } from "./stripe/paymentIntent";
import { getBookingSettings } from "./settings";
import { formatOperationalTimestamp } from "./dateUtils";
import type { NotificationService } from "./notificationService";
import type { BookingRepository } from "./repository";
import type { BookingRecord } from "./types";

export type CancellationNotificationSender = Pick<
  NotificationService,
  | "sendFreeCancellationConfirmation"
  | "sendLateCancellationConfirmation"
  | "sendInternalCancellationNotification"
  | "sendInternalCancellationFeeFailed"
>;

export type CancelBookingOutcome =
  | "invalid-token"
  | "not-eligible"
  | "already-cancelled-no-charge"
  | "fee-already-paid"
  | "fee-already-failed"
  | "fee-processing"
  | "cancelled-free"
  | "cancelled-fee-initiated"
  | "cancelled-fee-submission-failed";

export type CancelBookingResult = {
  outcome: CancelBookingOutcome;
  bookingId?: string;
  feeAmountCents?: number;
  paymentIntentId?: string;
};

function logError(step: string, bookingId: string, error: unknown): void {
  console.error(`[cancellationService] ${step} failed: bookingId=${bookingId}`, error instanceof Error ? error.message : "unknown error");
}

/**
 * The single entry point for customer self-service cancellation. Safe to
 * call repeatedly for the same booking in any state — every call
 * re-derives what (if anything) still needs to happen.
 */
export async function cancelBookingByToken(
  token: string,
  repository: BookingRepository,
  notifications: CancellationNotificationSender,
  now: Date = new Date(),
): Promise<CancelBookingResult> {
  if (!isPlausibleManageToken(token)) return { outcome: "invalid-token" };

  const bookingId = await repository.findBookingIdByManageTokenHash(hashManageToken(token));
  if (!bookingId) return { outcome: "invalid-token" };

  const record = await repository.getFullBookingRecord(bookingId);
  if (!record) return { outcome: "invalid-token" };

  if (record.bookingStatus !== BOOKING_STATUS.CANCELLED) {
    // Not yet cancelled. Only a booking still in its pre-charge state is
    // eligible — anything past PAYMENT_STATUS.SCHEDULED means the
    // appointment has already occurred (the normal charge only ever fires
    // after service completion) and cancellation is no longer meaningful.
    if (record.paymentStatus !== PAYMENT_STATUS.SCHEDULED) {
      return { outcome: "not-eligible", bookingId };
    }

    const settings = await getBookingSettings();
    const timing = getBookingTimingStatus(record.serviceDate, record.serviceStartTime, record.arrivalWindow, settings.timezone, now);

    if (timing.isMoreThan24HoursOut) {
      try {
        await repository.markBookingCancelled(bookingId, {
          paymentStatus: PAYMENT_STATUS.CANCELLED_NO_CHARGE,
          cancelledAt: formatOperationalTimestamp(now),
          cancellationFeeAmount: 0,
        });
      } catch (error) {
        logError("markBookingCancelled (free)", bookingId, error);
        throw error;
      }

      try {
        const updated = await repository.getFullBookingRecord(bookingId);
        if (updated) {
          await Promise.allSettled([
            notifications.sendFreeCancellationConfirmation(updated),
            notifications.sendInternalCancellationNotification(updated, { isLate: false }),
          ]);
        }
      } catch (error) {
        logError("free cancellation notifications", bookingId, error);
      }

      return { outcome: "cancelled-free", bookingId };
    }

    // Late cancellation: mark Cancelled + fee amount BEFORE any Stripe
    // interaction. This ordering is the actual safety mechanism — nothing
    // that happens with Stripe afterward (success, decline, or a crash)
    // can ever undo a write that already happened.
    const feeCents = calculateLateCancellationFeeCents(record.chargeAmount);
    try {
      await repository.markBookingCancelled(bookingId, {
        paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING,
        cancelledAt: formatOperationalTimestamp(now),
        cancellationFeeAmount: feeCents / 100,
      });
    } catch (error) {
      logError("markBookingCancelled (late)", bookingId, error);
      throw error;
    }
    // Falls through to the shared fee-resolution step below — this is the
    // exact same path a later recovery call takes.
  }

  return resolveCancellationFeeState(bookingId, repository, notifications, now);
}

/**
 * Re-reads current state and resolves whatever is pending. A no-op for
 * every already-terminal state (Cancelled — No Charge, Cancellation Fee
 * Paid/Failed, or Processing-with-a-PaymentIntent-already-recorded); only
 * takes action for the one recoverable condition: Cancelled,
 * Cancellation Fee Processing, and no PaymentIntent ID recorded yet.
 *
 * Exported (not just used internally by cancelBookingByToken) so the
 * Manage Booking page's own read path can call this as a best-effort
 * self-heal on every view. Only ever takes action for an already-Cancelled
 * booking — safe to call on an active (never-cancelled) booking too, since
 * that's guarded explicitly below rather than left to fall through.
 */
export async function resolveCancellationFeeState(
  bookingId: string,
  repository: BookingRepository,
  notifications: CancellationNotificationSender,
  now: Date,
): Promise<CancelBookingResult> {
  const record = await repository.getFullBookingRecord(bookingId);
  if (!record) return { outcome: "invalid-token" };
  if (record.bookingStatus !== BOOKING_STATUS.CANCELLED) return { outcome: "not-eligible", bookingId };

  switch (record.paymentStatus) {
    case PAYMENT_STATUS.CANCELLED_NO_CHARGE:
      return { outcome: "already-cancelled-no-charge", bookingId };
    case PAYMENT_STATUS.CANCELLATION_FEE_PAID:
      return { outcome: "fee-already-paid", bookingId, feeAmountCents: Math.round(record.cancellationFeeAmount * 100) };
    case PAYMENT_STATUS.CANCELLATION_FEE_FAILED:
      return { outcome: "fee-already-failed", bookingId };
    case PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING:
      if (record.stripePaymentIntentId) {
        // A PaymentIntent already exists — Stripe will deliver
        // payment_intent.succeeded/payment_intent.payment_failed, which is
        // authoritative. Never attempt to create a second one.
        return { outcome: "fee-processing", bookingId, paymentIntentId: record.stripePaymentIntentId };
      }
      // The exact recoverable condition: Cancelled, Processing, no
      // PaymentIntent yet — submit (or resume submitting) it now.
      return submitCancellationFeeCharge(record, repository, notifications, now);
    default:
      // Booking Status is Cancelled but Payment Status doesn't match any
      // known cancellation state — shouldn't happen; treat as resolved
      // rather than retrying anything unexpected.
      return { outcome: "already-cancelled-no-charge", bookingId };
  }
}

async function submitCancellationFeeCharge(
  record: BookingRecord,
  repository: BookingRepository,
  notifications: CancellationNotificationSender,
  now: Date,
): Promise<CancelBookingResult> {
  const amountCents = Math.round(record.cancellationFeeAmount * 100);
  // Deterministic and stable across retries/recovery — a duplicate
  // request (or a resumed one) always reuses this exact key, so Stripe's
  // own idempotency guarantee is what actually prevents a double charge,
  // independent of how many times this function runs.
  const idempotencyKey = `cancel-fee:${record.bookingId}`;

  const result = await createOffSessionPaymentIntent({
    customerId: record.stripeCustomerId,
    paymentMethodId: record.stripePaymentMethodId,
    amountCents,
    bookingId: record.bookingId,
    serviceDate: record.serviceDate,
    idempotencyKey,
    metadataType: "cancellation_fee",
  });

  if (result.outcome === "succeeded" || result.outcome === "requires_action" || result.paymentIntentId) {
    // A real Stripe PaymentIntent exists — leave final resolution to the
    // webhook (paymentWebhookService.ts), same exception-free rule
    // Milestone 5 already established for the normal charge.
    const paymentIntentId = result.paymentIntentId as string;
    try {
      await repository.updateCancellationFeeOutcome(record.bookingId, {
        paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING,
        stripePaymentIntentId: paymentIntentId,
        paidAt: "",
      });
    } catch (error) {
      logError("updateCancellationFeeOutcome (record PaymentIntent ID)", record.bookingId, error);
    }
    return { outcome: "cancelled-fee-initiated", bookingId: record.bookingId, paymentIntentId, feeAmountCents: amountCents };
  }

  // No PaymentIntent was ever created (connectivity/infra failure, not a
  // card decline) — no webhook will ever arrive for this attempt, so this
  // module resolves it directly, the same exception paymentProcessingService.ts
  // already established for the normal charge.
  return await resolveMissingPaymentIntent(record, repository, notifications, result.error);
}

async function resolveMissingPaymentIntent(
  record: BookingRecord,
  repository: BookingRepository,
  notifications: CancellationNotificationSender,
  failure: PaymentIntentFailureDetail,
): Promise<CancelBookingResult> {
  try {
    await repository.updateCancellationFeeOutcome(record.bookingId, {
      paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_FAILED,
      stripePaymentIntentId: "",
      paidAt: "",
    });
  } catch (error) {
    logError("updateCancellationFeeOutcome (terminal, no PaymentIntent)", record.bookingId, error);
  }

  try {
    const updated = await repository.getFullBookingRecord(record.bookingId);
    if (updated) await notifications.sendInternalCancellationFeeFailed(updated, failure);
  } catch (error) {
    logError("sendInternalCancellationFeeFailed", record.bookingId, error);
  }

  return { outcome: "cancelled-fee-submission-failed", bookingId: record.bookingId };
}

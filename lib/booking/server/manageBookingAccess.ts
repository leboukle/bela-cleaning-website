// SERVER-ONLY. The one place that resolves a Manage Booking token into a
// customer-safe view — shared by the page's server-side render and the
// GET API route, so there is exactly one token-resolution path.
import "server-only";
import { BOOKING_STATUS, PAYMENT_STATUS } from "./bookingsSheetSchema";
import { hashManageToken, isPlausibleManageToken } from "./manageToken";
import { resolveCancellationFeeState, type CancellationNotificationSender } from "./cancellationService";
import { buildManageBookingView, type ManageBookingView } from "./manageBookingView";
import type { BookingRepository } from "./repository";

export type ManageBookingAccessResult = { ok: true; view: ManageBookingView } | { ok: false };

/**
 * Resolves a token to its booking and builds the customer-safe view. If
 * the booking is sitting in the one recoverable "Cancelled + Cancellation
 * Fee Processing + no PaymentIntent yet" state (see cancellationService.ts),
 * this silently attempts to resolve it first — a best-effort self-heal so
 * simply viewing the Manage Booking page again can recover from a crash
 * between "recorded Cancelled" and "actually called Stripe." A recovery
 * failure here never breaks the page render; the next view (or an
 * explicit cancel retry) tries again.
 */
export async function getManageBookingView(
  token: string,
  repository: BookingRepository,
  notifications: CancellationNotificationSender,
  now: Date = new Date(),
): Promise<ManageBookingAccessResult> {
  if (!isPlausibleManageToken(token)) return { ok: false };

  const bookingId = await repository.findBookingIdByManageTokenHash(hashManageToken(token));
  if (!bookingId) return { ok: false };

  let record = await repository.getFullBookingRecord(bookingId);
  if (!record) return { ok: false };

  if (record.bookingStatus === BOOKING_STATUS.CANCELLED && record.paymentStatus === PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING && !record.stripePaymentIntentId) {
    try {
      await resolveCancellationFeeState(bookingId, repository, notifications, now);
      record = (await repository.getFullBookingRecord(bookingId)) ?? record;
    } catch {
      // Best-effort — fall through and show whatever the current state is.
    }
  }

  return { ok: true, view: await buildManageBookingView(record, now) };
}

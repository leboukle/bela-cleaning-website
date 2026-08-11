// SERVER-ONLY. Storage abstraction the booking domain talks to. Nothing
// above this interface (bookingService.ts, the API routes) knows or cares
// that Google Sheets is the current implementation — swapping in a real
// database later means writing one new class that implements this
// interface and changing a single wiring point, not touching the booking
// UI or the validation/pricing/availability logic at all.
import "server-only";
import type { BookingPaymentState, BookingRecord, PaymentAttemptUpdate } from "./types";
import type { NotificationStatusUpdate } from "./notificationStatus";

export type IdempotentBookingResult = {
  bookingId: string;
  totalPrice: number;
  estimatedDurationMinutes: number;
  serviceDate: string;
  arrivalWindow: string;
};

export interface BookingRepository {
  /** Appends exactly one row for a newly-accepted booking. */
  appendBooking(record: BookingRecord): Promise<void>;

  /** True if a booking with this exact ID already exists (collision check). */
  bookingIdExists(bookingId: string): Promise<boolean>;

  /**
   * Looks for a prior booking created from the same idempotency token,
   * within a bounded recent-row window (not the entire sheet history —
   * see googleSheetsRepository.ts for the documented tradeoff). Returns
   * enough of that booking's data to reconstruct a success response
   * without appending a duplicate row.
   */
  findRecentBookingByIdempotencyToken(token: string): Promise<IdempotentBookingResult | null>;

  /**
   * Fills in the notification-status columns for an already-appended
   * booking, once the customer/internal send attempts resolve. Best-effort
   * from the caller's perspective — bookingService.ts always wraps this in
   * its own try/catch, since a status-write failure must never affect the
   * booking's own success result (Milestone 4, docs/notifications.md §7).
   */
  updateNotificationStatus(bookingId: string, update: NotificationStatusUpdate): Promise<void>;

  /**
   * Re-reads a single booking's authoritative payment-relevant state by
   * ID. The payment-processing endpoint calls this for every booking ID
   * the scheduler reports as due — it never trusts amount, status, or
   * timing data asserted by the caller, only what this returns fresh from
   * the sheet. Returns null if the ID doesn't exist (defensive only; the
   * scheduler reads IDs from this same sheet, so this should not happen in
   * practice).
   */
  getBookingPaymentState(bookingId: string): Promise<BookingPaymentState | null>;

  /**
   * Writes the outcome of one charge attempt back to the booking's row.
   * Never touches any column outside the payment-attempt set (Payment
   * Status, Stripe Payment Intent ID, Paid At, Payment Attempt Count, Last/
   * Next Payment Attempt At, Payment Failure Code) — Manual Amount
   * Override and its timestamp are owned by BeLa staff editing the sheet
   * directly, never written by this method.
   */
  updatePaymentAttempt(bookingId: string, update: PaymentAttemptUpdate): Promise<void>;

  /**
   * Reads back the complete, current row for one booking. Used only where
   * the full record is genuinely needed (building payment notification
   * emails, which reference customer name/email/amount/etc.) — everything
   * else in the payment pipeline uses the narrower getBookingPaymentState.
   */
  getFullBookingRecord(bookingId: string): Promise<BookingRecord | null>;
}

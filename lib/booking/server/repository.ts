// SERVER-ONLY. Storage abstraction the booking domain talks to. Nothing
// above this interface (bookingService.ts, the API routes) knows or cares
// that Google Sheets is the current implementation — swapping in a real
// database later means writing one new class that implements this
// interface and changing a single wiring point, not touching the booking
// UI or the validation/pricing/availability logic at all.
import "server-only";
import type {
  AppointmentReminderUpdate,
  BookingCancellationInitiateUpdate,
  BookingPaymentState,
  BookingRecord,
  BookingReminderState,
  BookingRescheduleUpdate,
  CancellationFeeOutcomeUpdate,
  PaymentAttemptUpdate,
} from "./types";
import type { NotificationStatusUpdate } from "./notificationStatus";

export type IdempotentBookingResult = {
  bookingId: string;
  totalPrice: number;
  estimatedDurationMinutes: number;
  serviceDate: string;
  arrivalWindow: string;
  serviceStartTime: string;
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

  /**
   * Resolves a Manage Booking token's SHA-256 hash to the booking ID it
   * belongs to, by scanning the "Manage Booking Token Hash" column — the
   * only lookup path for a manage token; the raw token is never stored,
   * so there is nothing to look up more directly. Returns null if no row
   * matches (invalid/unrecognized token).
   */
  findBookingIdByManageTokenHash(tokenHash: string): Promise<string | null>;

  /**
   * The first write of a cancellation — sets Booking Status to Cancelled
   * unconditionally, plus Cancelled At / Payment Status / Cancellation Fee
   * Amount. Always called before any Stripe interaction, so that a
   * booking is durably Cancelled independent of whether a late-cancellation
   * fee charge later succeeds or fails.
   */
  markBookingCancelled(bookingId: string, update: BookingCancellationInitiateUpdate): Promise<void>;

  /**
   * Records the outcome of a cancellation-fee PaymentIntent attempt —
   * either "a PaymentIntent now exists, still Processing" (webhook will
   * resolve it) or a terminal Paid/Failed. Never touches Booking Status,
   * Cancelled At, or Cancellation Fee Amount.
   */
  updateCancellationFeeOutcome(bookingId: string, update: CancellationFeeOutcomeUpdate): Promise<void>;

  /**
   * Applies a successful reschedule: new Service Date/Arrival Window,
   * recalculated Scheduled Charge At, Rescheduled At, and the Original
   * Service Date/Arrival Window pair (which the caller has already
   * resolved to either "capture now" or "preserve the existing value" —
   * this method just writes whatever it's given).
   */
  updateBookingReschedule(bookingId: string, update: BookingRescheduleUpdate): Promise<void>;

  /**
   * Re-reads a single booking's authoritative reminder-relevant state by
   * ID. Milestone 6 amendment: the reminder scheduler endpoint calls this
   * for every booking ID the Apps Script reminder trigger reports — it
   * never trusts due-ness, attempt count, or eligibility asserted by the
   * caller, only what this returns fresh from the sheet. Returns null if
   * the ID doesn't exist (defensive only).
   */
  getBookingReminderState(bookingId: string): Promise<BookingReminderState | null>;

  /**
   * Writes the outcome of one appointment-reminder attempt — success,
   * a retry-eligible transient failure, or a permanent (3rd-attempt)
   * failure. Never touches any other column.
   */
  updateAppointmentReminderStatus(bookingId: string, update: AppointmentReminderUpdate): Promise<void>;
}

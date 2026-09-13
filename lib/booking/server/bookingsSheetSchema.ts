// SERVER-ONLY. Single source of truth for the "Bookings" worksheet's exact
// column order. Every module that reads or writes that sheet (the
// repository's append, and availability's capacity count) derives its A1
// ranges from this array instead of hardcoding column letters, so there is
// exactly one place to update if the approved contract ever changes — and
// exactly one place that enforces "no column-order drift."
import "server-only";

export const BOOKINGS_SHEET_NAME = "Bookings";

// Exact order per the approved Bookings column contract. Do not reorder,
// remove, or insert columns here without updating docs/booking-backend.md
// and confirming with the business — this array *is* the contract.
export const BOOKINGS_COLUMNS = [
  "Booking ID",
  "Submitted At",
  "Booking Status",
  "Payment Status",
  "First Name",
  "Last Name",
  "Email",
  "Mobile",
  "Street Address",
  "Apartment or Unit",
  "City",
  "State",
  "ZIP Code",
  "Someone Home",
  "Service Date",
  "Arrival Window",
  "Property Type",
  "Square Footage",
  "Bedrooms",
  "Bathrooms",
  "Cleaning Type",
  "Extras",
  "Frequency",
  "Base Cleaning Price",
  "Bathroom Price",
  "Cleaning Type Price",
  "Extras Price",
  "Subtotal",
  "Frequency Discount",
  "Total Price",
  "Estimated Duration Minutes",
  "Special Instructions",
  "Policy Accepted",
  "Submission Source",
  "Stripe Checkout Session ID",
  "Stripe Payment Intent ID",
  "Paid At",
  "Cancelled At",
  "Completed At",
  "Internal Notes",
  "Schema Version",
  // Milestone 4 addition, approved before implementation per the project's
  // standing rule against silently changing the live column contract — see
  // docs/notifications.md §7. Appended at the end rather than interleaved
  // among the Milestone 3 columns so every existing column keeps its exact
  // position. Both status cells start blank at appendBooking() time (the
  // outcome isn't known yet) and are filled in moments later by
  // GoogleSheetsBookingRepository.updateNotificationStatus() once the two
  // send attempts resolve.
  "Customer Confirmation Status",
  "Internal Notification Status",
  "Notification Attempt At",
  // Milestone 5 addition, approved before implementation — see
  // docs/payments.md. Appended at the end, same rationale as the
  // Milestone 4 columns: every prior column keeps its exact position.
  // "Stripe Checkout Session ID" (above) is a Milestone-3-era placeholder
  // for an architecture this milestone doesn't use (SetupIntent +
  // off-session PaymentIntent, not Checkout Sessions) — left in place,
  // permanently blank, rather than repurposed or removed. "Stripe Payment
  // Intent ID" and "Paid At" (also above) are reused as-is; "Payment
  // Status" (column D) now carries the richer PAYMENT_STATUS value set
  // defined below instead of only "Unpaid".
  "Stripe Customer ID",
  "Stripe PaymentMethod ID",
  "Stripe SetupIntent ID",
  "Scheduled Charge At",
  "Original Booking Total",
  "Charge Amount",
  "Payment Attempt Count",
  "Last Payment Attempt At",
  "Next Payment Attempt At",
  "Payment Failure Code",
  "Manual Amount Override",
  "Manual Amount Override At",
  // Milestone 6 addition, approved before implementation — see
  // docs/manage-booking.md. Appended at the end, same rationale as every
  // prior milestone's additions: every existing column keeps its exact
  // position. "Stripe Payment Intent ID" and "Paid At" (above, Milestone
  // 3/5) are reused as-is for the late-cancellation fee's PaymentIntent —
  // safe because a booking can only ever be cancelled *before* its normal
  // scheduled charge would ever be attempted (that charge only fires
  // after the appointment happens), so those two columns are always still
  // blank at cancellation time. "Payment Status" (column D) carries 4 new
  // cancellation-specific values instead of a separate status column.
  "Manage Booking Token Hash",
  "Cancellation Fee Amount",
  // Reschedule audit trail. "Original Service Date"/"Original Arrival
  // Window" are populated only on a booking's *first* reschedule and are
  // never overwritten afterward — see reschedulingService.ts.
  "Rescheduled At",
  "Original Service Date",
  "Original Arrival Window",
  // Milestone 6 amendment additions, approved before implementation — see
  // docs/manage-booking.md. Appended at the end, same rationale as every
  // prior addition: every existing column keeps its exact position.
  // "Appointment Reminder Status"/"Appointment Reminder Sent At" were
  // added to the Preview sheet by the business ahead of this
  // implementation; "Service Start Time"/"Original Service Start Time"/
  // "Appointment Reminder Attempts" are proposed here and NOT yet added to
  // any live sheet — see the amendment report for the exact cells.
  "Appointment Reminder Status",
  "Appointment Reminder Sent At",
  // Exact appointment start times: replaces "Arrival Window" for new
  // bookings going forward. Canonical "HH:00" 24-hour string; blank means
  // this is a legacy (pre-amendment) row still resolved via Arrival
  // Window — see serviceTime.ts's resolveRecordStartSpec, the one
  // chokepoint every timing-sensitive consumer uses instead of branching
  // on "is this exact-time or legacy" itself. A reschedule always writes
  // this field and clears Arrival Window, regardless of which kind of
  // booking it started as (see reschedulingService.ts) — so once any
  // booking is rescheduled, this field becomes its sole authoritative
  // current time going forward.
  "Service Start Time",
  // Reschedule audit trail's exact-time counterpart to "Original Arrival
  // Window" — populated only on a booking's *first* reschedule (whichever
  // of the two start-time fields was actually populated then) and never
  // overwritten afterward. Mirrors "Original Arrival Window" exactly; see
  // reschedulingService.ts.
  "Original Service Start Time",
  // Bounded retry counter for the 72-hour appointment reminder (max 3
  // customer-send attempts) — mirrors "Payment Attempt Count"'s existing
  // role for the analogous bounded payment-retry scenario. See
  // reminderService.ts.
  "Appointment Reminder Attempts",
  // Milestone 6 amendment (post-verification fix): the reminder email
  // needs its own directly-usable Manage Booking link, but the original
  // token's raw value is never recoverable from "Manage Booking Token
  // Hash" (only its one-way hash is stored) — so a *second*, independent
  // token is minted at reminder-send time, on the same secure random
  // generator, and only ITS hash is stored here. This is deliberately a
  // separate column, not an overwrite of "Manage Booking Token Hash":
  // rotating the original would silently break a link the customer may
  // already have saved from their confirmation email. Both hashes are
  // checked on every token lookup (see googleSheetsRepository.ts's
  // findBookingIdByManageTokenHash), so either link works, indefinitely,
  // for the same booking. Re-minted on every reminder send attempt
  // (overwriting only this column) — bounded to at most one currently-
  // valid reminder-issued token at a time, never touching the original.
  // See reminderService.ts and docs/manage-booking.md.
  "Manage Booking Reminder Token Hash",
] as const;

export type BookingColumn = (typeof BOOKINGS_COLUMNS)[number];

function columnIndexToLetter(zeroBasedIndex: number): string {
  let n = zeroBasedIndex + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function columnLetter(column: BookingColumn): string {
  const index = BOOKINGS_COLUMNS.indexOf(column);
  if (index === -1) throw new Error(`Unknown Bookings column: ${column}`);
  return columnIndexToLetter(index);
}

export const BOOKINGS_LAST_COLUMN_LETTER = columnIndexToLetter(BOOKINGS_COLUMNS.length - 1);
export const BOOKINGS_FULL_RANGE = `${BOOKINGS_SHEET_NAME}!A:${BOOKINGS_LAST_COLUMN_LETTER}`;

// The only status value this milestone treats specially: everything else
// (including the initial "Pending Payment") consumes daily capacity: only
// "Cancelled" rows are excluded — see STEP 7 of the milestone spec.
export const BOOKING_STATUS = {
  PENDING_PAYMENT: "Pending Payment",
  CANCELLED: "Cancelled",
} as const;

// "Unpaid" is the Milestone 3/4-era value, kept for backward compatibility
// with rows written before Milestone 5 — no migration needed for historical
// test rows, they simply predate the richer payment lifecycle. Every new
// booking (Milestone 5 onward) starts at SCHEDULED, never UNPAID. See
// docs/payments.md for the full state machine and transition rules.
export const PAYMENT_STATUS = {
  UNPAID: "Unpaid",
  SCHEDULED: "Scheduled",
  PROCESSING: "Processing",
  PAID: "Paid",
  RETRY_SCHEDULED: "Retry Scheduled",
  REQUIRES_ACTION: "Requires Action",
  FINAL_FAILURE: "Final Failure",
  // Milestone 6: a free (>24h) cancellation's terminal payment state — no
  // charge ever occurs, but this is more legible on a Cancelled row than
  // leaving "Scheduled" stale forever.
  CANCELLED_NO_CHARGE: "Cancelled — No Charge",
  // Milestone 6: the late-cancellation (<=24h) fee's own lifecycle,
  // reusing this same column rather than a separate status column — a
  // cancellation fee is simply a different kind of "the one payment event
  // this booking will have," which is exactly what this field already
  // tracks. See cancellationService.ts and docs/manage-booking.md.
  CANCELLATION_FEE_PROCESSING: "Cancellation Fee Processing",
  CANCELLATION_FEE_PAID: "Cancellation Fee Paid",
  CANCELLATION_FEE_FAILED: "Cancellation Fee Failed",
} as const;

// Milestone 6 amendment: bounded-retry state for the 72-hour appointment
// reminder. Blank ("") = not yet attempted. "Retry Scheduled" mirrors
// Payment Status's own vocabulary for an identical bounded-retry shape —
// a transient failure with attempts remaining, eligible for the next
// hourly scheduler run. "Sent"/"Failed" are both terminal: the scheduler
// skips any row in either state permanently (see reminderService.ts) —
// this is what satisfies "do not repeatedly spam the customer."
export const APPOINTMENT_REMINDER_STATUS = {
  RETRY_SCHEDULED: "Retry Scheduled",
  SENT: "Sent",
  FAILED: "Failed",
} as const;

export const SUBMISSION_SOURCE = "Website";

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
} as const;

export const SUBMISSION_SOURCE = "Website";

// SERVER-ONLY. Milestone 7 — column contracts for the two new worksheets
// this milestone adds: "Cleaners" (a small, mostly-static directory) and
// "Cleaner Assignments" (an append-only event log, one row per assignment
// *attempt* — never overwritten, so declined/expired history is
// preserved when a booking is re-offered to a different cleaner). Mirrors
// bookingsSheetSchema.ts's exact pattern (one source-of-truth column
// array per sheet, plus a columnLetter() helper) — do not reorder,
// remove, or insert columns without updating docs/cleaner-assignment.md.
import "server-only";

export const CLEANERS_SHEET_NAME = "Cleaners";
export const CLEANER_ASSIGNMENTS_SHEET_NAME = "Cleaner Assignments";

// No payout-rate column: BeLa's cleaner compensation is a single standing
// 60% rate applied to every cleaner, defined once in
// lib/booking/cleanerPayout.ts (STANDARD_CLEANER_PAYOUT_PERCENTAGE) —
// not per-cleaner configuration, so it is not stored here. See
// assignmentService.ts's createAssignment for where that rate is applied
// and snapshotted onto the Cleaner Assignments row.
export const CLEANERS_COLUMNS = [
  "Cleaner ID",
  "First Name",
  "Last Name",
  "Email",
  "Phone",
  "Status",
  "Created At",
] as const;

export type CleanersColumn = (typeof CLEANERS_COLUMNS)[number];

export const CLEANER_ASSIGNMENTS_COLUMNS = [
  "Assignment ID",
  "Booking ID",
  "Cleaner ID",
  "Cleaner Name",
  "Status",
  "Offered At",
  // Raw ISO instant, re-parsed by the expiry scheduler — never
  // formatOperationalTimestamp. Mirrors Scheduled Charge At / Next
  // Payment Attempt At's existing "reparsed field" convention exactly.
  "Response Deadline",
  "Accepted At",
  "Declined At",
  "Expired At",
  "Cleaning Total Snapshot",
  "Payout Percentage Snapshot",
  "Payout Amount Snapshot",
  "Assignment Token Hash",
  "Cleaner Reminder Status",
  "Cleaner Reminder Sent At",
  "Cleaner Reminder Attempts",
  "Payout Statement Sent At",
] as const;

export type CleanerAssignmentsColumn = (typeof CLEANER_ASSIGNMENTS_COLUMNS)[number];

export const CLEANER_STATUS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
} as const;

// "Unassigned" is deliberately not a stored value — it's the absence of
// any Pending/Accepted row for a Booking ID (see assignmentService.ts).
export const ASSIGNMENT_STATUS = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
} as const;

// Mirrors APPOINTMENT_REMINDER_STATUS's vocabulary exactly (bookingsSheetSchema.ts)
// for the analogous bounded-retry cleaner-reminder scenario.
export const CLEANER_REMINDER_STATUS = {
  RETRY_SCHEDULED: "Retry Scheduled",
  SENT: "Sent",
  FAILED: "Failed",
} as const;

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

export function cleanersColumnLetter(column: CleanersColumn): string {
  const index = CLEANERS_COLUMNS.indexOf(column);
  if (index === -1) throw new Error(`Unknown Cleaners column: ${column}`);
  return columnIndexToLetter(index);
}

export function assignmentsColumnLetter(column: CleanerAssignmentsColumn): string {
  const index = CLEANER_ASSIGNMENTS_COLUMNS.indexOf(column);
  if (index === -1) throw new Error(`Unknown Cleaner Assignments column: ${column}`);
  return columnIndexToLetter(index);
}

export const CLEANERS_LAST_COLUMN_LETTER = columnIndexToLetter(CLEANERS_COLUMNS.length - 1);
export const CLEANER_ASSIGNMENTS_LAST_COLUMN_LETTER = columnIndexToLetter(CLEANER_ASSIGNMENTS_COLUMNS.length - 1);

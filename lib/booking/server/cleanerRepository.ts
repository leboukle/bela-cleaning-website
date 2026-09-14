// SERVER-ONLY. Storage abstraction for the Milestone 7 cleaner-assignment
// domain — mirrors repository.ts's role exactly (nothing above this
// interface knows or cares that Google Sheets is the implementation) but
// is kept as its OWN interface, not merged into BookingRepository:
// cleaners and assignments are a genuinely distinct bounded concern (see
// the approved architecture report), and keeping them separate means
// BookingRepository and every existing consumer of it stay completely
// untouched by this milestone.
import "server-only";
import type { AssignmentResolutionUpdate, AssignmentRecord, CleanerReminderUpdate, CleanerRecord, CreateAssignmentUpdate } from "./cleanerTypes";

export interface CleanerAssignmentRepository {
  /** All cleaners with Status = Active, for the internal assignment UI's cleaner picker. */
  getActiveCleaners(): Promise<CleanerRecord[]>;

  /** A single cleaner by ID — used to re-verify Active status server-side before ever creating an assignment. */
  getCleanerById(cleanerId: string): Promise<CleanerRecord | null>;

  /**
   * The most recently offered assignment for a booking, if any — since
   * Cleaner Assignments is append-only, a booking can have several rows
   * over time (declined, then re-offered); this always resolves to the
   * LAST one, never the first match. Returns null if no assignment has
   * ever been offered for this booking.
   */
  getLatestAssignmentForBooking(bookingId: string): Promise<AssignmentRecord | null>;

  /** Appends exactly one new assignment row. Never overwrites a prior row for the same Booking ID — see getLatestAssignmentForBooking. */
  createAssignment(update: CreateAssignmentUpdate): Promise<void>;

  /**
   * Resolves an Assignment Token Hash to its assignment row — the only
   * lookup path for the cleaner-facing Accept/Decline page, mirroring
   * findBookingIdByManageTokenHash's role for Manage Booking tokens.
   */
  findAssignmentByTokenHash(tokenHash: string): Promise<AssignmentRecord | null>;

  /** Re-reads a single assignment's authoritative current state by ID — used by the expiry/reminder/payout-statement schedulers, which never trust due-ness asserted by the caller. */
  getAssignmentById(assignmentId: string): Promise<AssignmentRecord | null>;

  /** Writes the outcome of an Accept/Decline/Expire transition. Only ever called on the assignment's own row — never touches an earlier row for the same booking. */
  updateAssignmentResolution(assignmentId: string, update: AssignmentResolutionUpdate): Promise<void>;

  /** Writes the outcome of one cleaner-reminder attempt — mirrors updateAppointmentReminderStatus. */
  updateCleanerReminderStatus(assignmentId: string, update: CleanerReminderUpdate): Promise<void>;

  /** Idempotency guard for the post-cleaning payout statement — set once, never cleared. */
  markPayoutStatementSent(assignmentId: string, sentAt: string): Promise<void>;
}

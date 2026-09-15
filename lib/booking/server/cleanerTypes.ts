// SERVER-ONLY. Types for the Milestone 7 cleaner-assignment domain —
// mirrors types.ts's split (a full row-shaped record, plus narrower
// update/state slices each write path is scoped to) applied to the two
// new sheets instead of Bookings.
import "server-only";

export type CleanerRecord = {
  cleanerId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string; // CLEANER_STATUS.ACTIVE | INACTIVE
  createdAt: string;
};

/** One assignment-offer row, in Cleaner Assignments column order. */
export type AssignmentRecord = {
  assignmentId: string;
  bookingId: string;
  cleanerId: string;
  cleanerName: string;
  status: string; // ASSIGNMENT_STATUS.*
  offeredAt: string;
  responseDeadline: string; // raw ISO, reparsed by the expiry scheduler
  acceptedAt: string;
  declinedAt: string;
  expiredAt: string;
  cleaningTotalSnapshot: number;
  payoutPercentageSnapshot: number;
  payoutAmountSnapshot: number;
  assignmentTokenHash: string;
  cleanerReminderStatus: string;
  cleanerReminderSentAt: string;
  cleanerReminderAttempts: number;
  payoutStatementSentAt: string;
};

/** Written once, at assignment-creation time, by assignmentService.createAssignment. */
export type CreateAssignmentUpdate = {
  assignmentId: string;
  bookingId: string;
  cleanerId: string;
  cleanerName: string;
  status: string;
  offeredAt: string;
  responseDeadline: string;
  cleaningTotalSnapshot: number;
  payoutPercentageSnapshot: number;
  payoutAmountSnapshot: number;
  assignmentTokenHash: string;
};

/** Written by assignmentService.acceptAssignment/declineAssignment/expireAssignment — never touches an earlier row. */
export type AssignmentResolutionUpdate = {
  status: string;
  acceptedAt: string;
  declinedAt: string;
  expiredAt: string;
};

/** Written by cleanerReminderService.ts after every reminder attempt — mirrors AppointmentReminderUpdate. */
export type CleanerReminderUpdate = {
  cleanerReminderStatus: string;
  cleanerReminderSentAt: string;
  cleanerReminderAttempts: number;
};

/**
 * The reminder-relevant slice of an assignment row, re-read fresh for
 * every scheduler attempt — mirrors BookingReminderState's role. Includes
 * enough of the *booking's* timing data (joined in by the service layer,
 * not stored redundantly here) to derive service start the same way
 * reminderService.ts already does.
 */
export type AssignmentReminderState = {
  assignmentId: string;
  bookingId: string;
  status: string;
  cleanerReminderStatus: string;
  cleanerReminderAttempts: number;
};

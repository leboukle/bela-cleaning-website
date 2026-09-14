// SERVER-ONLY. Two small, related concerns: (1) recording BeLa's explicit
// human confirmation that a cleaning happened (markBookingComplete — the
// one and only writer of the previously-dormant "Completed At" column),
// and (2) sending the post-cleaning payout statement once that
// confirmation exists for a booking with an Accepted assignment
// (processPayoutStatementDue, called by the scheduler). Deliberately
// never infers completion from elapsed/scheduled time — see the
// architecture report §8's explicit requirement.
import "server-only";
import { BOOKING_STATUS } from "./bookingsSheetSchema";
import { ASSIGNMENT_STATUS } from "./cleanerSheetSchema";
import { formatOperationalTimestamp } from "./dateUtils";
import type { BookingRepository } from "./repository";
import type { CleanerAssignmentRepository } from "./cleanerRepository";
import type { CleanerNotificationService } from "./cleanerNotificationService";

export type PayoutStatementNotificationSender = Pick<CleanerNotificationService, "sendCleanerPayoutStatement">;

export type MarkCompleteOutcome =
  | { outcome: "not-found" }
  | { outcome: "booking-cancelled" }
  | { outcome: "already-completed"; completedAt: string }
  | { outcome: "completed"; completedAt: string };

/** BeLa-initiated only, via the internal assignment page / internal API — never automatic, never inferred from elapsed time. */
export async function markBookingComplete(bookingId: string, bookingRepository: BookingRepository, now: Date = new Date()): Promise<MarkCompleteOutcome> {
  const record = await bookingRepository.getFullBookingRecord(bookingId);
  if (!record) return { outcome: "not-found" };
  if (record.bookingStatus === BOOKING_STATUS.CANCELLED) return { outcome: "booking-cancelled" };
  if (record.completedAt) return { outcome: "already-completed", completedAt: record.completedAt };

  const completedAt = formatOperationalTimestamp(now);
  await bookingRepository.markBookingCompleted(bookingId, completedAt);
  return { outcome: "completed", completedAt };
}

export type ProcessPayoutStatementOutcome =
  | { assignmentId: string; outcome: "not-found" }
  | { assignmentId: string; outcome: "skipped-not-accepted"; status: string }
  | { assignmentId: string; outcome: "skipped-already-sent" }
  | { assignmentId: string; outcome: "skipped-not-completed" }
  | { assignmentId: string; outcome: "sent" }
  | { assignmentId: string; outcome: "send-failed" };

function logError(step: string, assignmentId: string, error: unknown): void {
  console.error(`[completionService] ${step} failed: assignmentId=${assignmentId}`, error instanceof Error ? error.message : "unknown error");
}

/**
 * Called by the payout-statement scheduler route for one candidate
 * Assignment ID — always re-validates every condition itself (Accepted,
 * not already sent, booking genuinely Completed At) rather than trusting
 * anything the caller asserts. Retries on the next hourly run if the send
 * itself fails; no attempt cap — an unpaid-looking cleaner is worth
 * retrying indefinitely rather than giving up after N tries.
 */
export async function processPayoutStatementDue(
  assignmentId: string,
  bookingRepository: BookingRepository,
  assignmentRepository: CleanerAssignmentRepository,
  notifications: PayoutStatementNotificationSender,
  now: Date = new Date(),
): Promise<ProcessPayoutStatementOutcome> {
  const assignment = await assignmentRepository.getAssignmentById(assignmentId);
  if (!assignment) return { assignmentId, outcome: "not-found" };
  if (assignment.status !== ASSIGNMENT_STATUS.ACCEPTED) {
    return { assignmentId, outcome: "skipped-not-accepted", status: assignment.status };
  }
  if (assignment.payoutStatementSentAt) return { assignmentId, outcome: "skipped-already-sent" };

  const record = await bookingRepository.getFullBookingRecord(assignment.bookingId);
  if (!record) return { assignmentId, outcome: "not-found" };
  if (!record.completedAt) return { assignmentId, outcome: "skipped-not-completed" };

  const cleaner = await assignmentRepository.getCleanerById(assignment.cleanerId);
  if (!cleaner) return { assignmentId, outcome: "not-found" };

  const sendResult = await notifications.sendCleanerPayoutStatement(record, cleaner, assignment);
  if (!sendResult.ok) {
    logError("sendCleanerPayoutStatement", assignmentId, new Error(sendResult.error));
    return { assignmentId, outcome: "send-failed" };
  }

  try {
    await assignmentRepository.markPayoutStatementSent(assignmentId, formatOperationalTimestamp(now));
  } catch (error) {
    logError("markPayoutStatementSent", assignmentId, error);
  }
  return { assignmentId, outcome: "sent" };
}

// SERVER-ONLY. Orchestrates one 72-hour cleaner-reminder attempt for one
// ACCEPTED assignment, called by
// app/api/cleaner-assignments/reminders/process-due/route.ts once per due
// Assignment ID the Apps Script cleaner-assignment scheduler reports.
// Completely separate from reminderService.ts's customer reminder — never
// reads or writes anything on the customer reminder's own columns, never
// changes its timing. Reuses that module's due-window/attempt-cap policy
// (deriveServiceStartAt, REMINDER_WINDOW_MS, MAX_REMINDER_ATTEMPTS) so
// both reminders agree on "72 hours before service" via one shared
// implementation, not two that could drift.
import "server-only";
import { BOOKING_STATUS } from "./bookingsSheetSchema";
import { ASSIGNMENT_STATUS, CLEANER_REMINDER_STATUS } from "./cleanerSheetSchema";
import { deriveServiceStartAt, REMINDER_WINDOW_MS, MAX_REMINDER_ATTEMPTS } from "./reminderService";
import { formatOperationalTimestamp } from "./dateUtils";
import type { BookingRepository } from "./repository";
import type { CleanerAssignmentRepository } from "./cleanerRepository";
import type { CleanerNotificationService } from "./cleanerNotificationService";

export type CleanerReminderNotificationSender = Pick<CleanerNotificationService, "sendCleanerAppointmentReminder">;

export type ProcessCleanerReminderOutcome =
  | { assignmentId: string; outcome: "not-found" }
  | { assignmentId: string; outcome: "skipped-not-accepted"; status: string }
  | { assignmentId: string; outcome: "skipped-cancelled-booking" }
  | { assignmentId: string; outcome: "skipped-already-resolved"; status: string }
  | { assignmentId: string; outcome: "skipped-not-due" }
  | { assignmentId: string; outcome: "sent"; attempt: number }
  | { assignmentId: string; outcome: "retry-scheduled"; attempt: number }
  | { assignmentId: string; outcome: "failed-permanently"; attempt: number };

function logError(step: string, assignmentId: string, error: unknown): void {
  console.error(`[cleanerReminderService] ${step} failed: assignmentId=${assignmentId}`, error instanceof Error ? error.message : "unknown error");
}

export async function processCleanerReminderForAssignment(
  assignmentId: string,
  bookingRepository: BookingRepository,
  assignmentRepository: CleanerAssignmentRepository,
  notifications: CleanerReminderNotificationSender,
  now: Date = new Date(),
): Promise<ProcessCleanerReminderOutcome> {
  const assignment = await assignmentRepository.getAssignmentById(assignmentId);
  if (!assignment) return { assignmentId, outcome: "not-found" };
  if (assignment.status !== ASSIGNMENT_STATUS.ACCEPTED) {
    return { assignmentId, outcome: "skipped-not-accepted", status: assignment.status };
  }

  // Both Sent and Failed are terminal — never re-send after success, never
  // keep retrying past the approved cap. Mirrors reminderService.ts's own guard.
  if (assignment.cleanerReminderStatus === CLEANER_REMINDER_STATUS.SENT || assignment.cleanerReminderStatus === CLEANER_REMINDER_STATUS.FAILED) {
    return { assignmentId, outcome: "skipped-already-resolved", status: assignment.cleanerReminderStatus };
  }

  const record = await bookingRepository.getFullBookingRecord(assignment.bookingId);
  if (!record) return { assignmentId, outcome: "not-found" };
  if (record.bookingStatus === BOOKING_STATUS.CANCELLED) return { assignmentId, outcome: "skipped-cancelled-booking" };

  const serviceStartAt = deriveServiceStartAt(record.scheduledChargeAt, record.estimatedDurationMinutes);
  if (!serviceStartAt) return { assignmentId, outcome: "skipped-not-due" }; // defensive — malformed/missing data

  const dueAt = new Date(serviceStartAt.getTime() - REMINDER_WINDOW_MS);
  const isDue = now.getTime() >= dueAt.getTime() && now.getTime() < serviceStartAt.getTime();
  if (!isDue) return { assignmentId, outcome: "skipped-not-due" };

  const cleaner = await assignmentRepository.getCleanerById(assignment.cleanerId);
  if (!cleaner) return { assignmentId, outcome: "not-found" };

  const attemptNumber = assignment.cleanerReminderAttempts + 1;
  const sendResult = await notifications.sendCleanerAppointmentReminder(record, cleaner, assignment);

  if (sendResult.ok) {
    try {
      await assignmentRepository.updateCleanerReminderStatus(assignmentId, {
        cleanerReminderStatus: CLEANER_REMINDER_STATUS.SENT,
        cleanerReminderSentAt: formatOperationalTimestamp(now),
        cleanerReminderAttempts: attemptNumber,
      });
    } catch (error) {
      logError("updateCleanerReminderStatus (sent)", assignmentId, error);
    }
    return { assignmentId, outcome: "sent", attempt: attemptNumber };
  }

  if (attemptNumber >= MAX_REMINDER_ATTEMPTS) {
    try {
      await assignmentRepository.updateCleanerReminderStatus(assignmentId, {
        cleanerReminderStatus: CLEANER_REMINDER_STATUS.FAILED,
        cleanerReminderSentAt: "",
        cleanerReminderAttempts: attemptNumber,
      });
    } catch (error) {
      logError("updateCleanerReminderStatus (failed)", assignmentId, error);
    }
    logError("cleaner reminder permanently failed after max attempts", assignmentId, new Error(sendResult.error));
    return { assignmentId, outcome: "failed-permanently", attempt: attemptNumber };
  }

  try {
    await assignmentRepository.updateCleanerReminderStatus(assignmentId, {
      cleanerReminderStatus: CLEANER_REMINDER_STATUS.RETRY_SCHEDULED,
      cleanerReminderSentAt: "",
      cleanerReminderAttempts: attemptNumber,
    });
  } catch (error) {
    logError("updateCleanerReminderStatus (retry scheduled)", assignmentId, error);
  }
  return { assignmentId, outcome: "retry-scheduled", attempt: attemptNumber };
}

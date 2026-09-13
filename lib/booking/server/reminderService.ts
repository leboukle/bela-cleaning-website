// SERVER-ONLY. Orchestrates one 72-hour appointment-reminder attempt for
// one booking, called by app/api/reminders/process-due/route.ts once per
// due booking ID the Apps Script reminder scheduler reports. Mirrors
// paymentProcessingService.ts's role: the route is thin HTTP plumbing,
// this module is where the actual sequencing and business rules live.
//
// Service start is derived from Scheduled Charge At (an absolute UTC
// instant already correct for both exact-time and legacy bookings) minus
// (estimated duration + the 1-hour post-cleaning charge delay) — pure
// millisecond arithmetic, deliberately avoiding a second DST-aware
// conversion here (or in Apps Script, which performs the identical
// arithmetic to decide which booking IDs even look due — see
// apps-script/reminderScheduler.gs). This module still independently
// re-derives and re-checks the window itself before doing anything —
// Apps Script's due-claim is never trusted.
//
// Post-verification fix: the reminder email needs its own directly-usable
// Manage Booking link, but the original token's raw value is never
// recoverable from its stored hash (see manageToken.ts) — so a second,
// independent token is minted here on every attempt and only its hash is
// persisted, in a dedicated column, alongside (never overwriting) the
// original. Both remain valid, indefinitely, for the same booking — see
// docs/manage-booking.md.
import "server-only";
import { BOOKING_STATUS, APPOINTMENT_REMINDER_STATUS } from "./bookingsSheetSchema";
import { CHARGE_DELAY_AFTER_END_MINUTES } from "./scheduledCharge";
import { generateManageToken, hashManageToken } from "./manageToken";
import type { NotificationService } from "./notificationService";
import type { BookingRepository } from "./repository";
import { formatOperationalTimestamp } from "./dateUtils";

export type ReminderNotificationSender = Pick<
  NotificationService,
  "sendAppointmentReminder" | "sendInternalReminderSent" | "sendInternalReminderFailed"
>;

export type ProcessReminderOutcome =
  | { bookingId: string; outcome: "not-found" }
  | { bookingId: string; outcome: "skipped-cancelled" }
  | { bookingId: string; outcome: "skipped-already-resolved"; status: string }
  | { bookingId: string; outcome: "skipped-not-due" }
  | { bookingId: string; outcome: "sent"; attempt: number }
  | { bookingId: string; outcome: "retry-scheduled"; attempt: number }
  | { bookingId: string; outcome: "failed-permanently"; attempt: number };

// Approved bounded-retry policy: an initial attempt ~72h before service,
// up to 2 more retries on later hourly scheduler runs, 3 total customer-
// send attempts before giving up and alerting BeLa.
const REMINDER_WINDOW_MS = 72 * 60 * 60 * 1000;
export const MAX_REMINDER_ATTEMPTS = 3;

function logError(step: string, bookingId: string, error: unknown): void {
  console.error(`[reminderService] ${step} failed: bookingId=${bookingId}`, error instanceof Error ? error.message : "unknown error");
}

/** Derives a booking's real service start from Scheduled Charge At + duration — see module docstring. */
function deriveServiceStartAt(scheduledChargeAtIso: string, estimatedDurationMinutes: number): Date | null {
  if (!scheduledChargeAtIso || !Number.isFinite(estimatedDurationMinutes) || estimatedDurationMinutes <= 0) return null;
  const chargeAt = new Date(scheduledChargeAtIso);
  if (Number.isNaN(chargeAt.getTime())) return null;
  return new Date(chargeAt.getTime() - (estimatedDurationMinutes + CHARGE_DELAY_AFTER_END_MINUTES) * 60_000);
}

export async function processReminderForBooking(
  bookingId: string,
  repository: BookingRepository,
  notifications: ReminderNotificationSender,
  now: Date = new Date(),
): Promise<ProcessReminderOutcome> {
  const state = await repository.getBookingReminderState(bookingId);
  if (!state) return { bookingId, outcome: "not-found" };
  if (state.bookingStatus === BOOKING_STATUS.CANCELLED) return { bookingId, outcome: "skipped-cancelled" };

  // Both Sent and Failed are terminal — the scheduler must never send a
  // second reminder after success, and must never keep retrying past the
  // approved attempt cap (this is what satisfies "do not repeatedly spam
  // the customer"). Blank and Retry Scheduled are the only eligible
  // states.
  if (
    state.appointmentReminderStatus === APPOINTMENT_REMINDER_STATUS.SENT ||
    state.appointmentReminderStatus === APPOINTMENT_REMINDER_STATUS.FAILED
  ) {
    return { bookingId, outcome: "skipped-already-resolved", status: state.appointmentReminderStatus };
  }

  const serviceStartAt = deriveServiceStartAt(state.scheduledChargeAt, state.estimatedDurationMinutes);
  if (!serviceStartAt) return { bookingId, outcome: "skipped-not-due" }; // defensive — malformed/missing data

  const dueAt = new Date(serviceStartAt.getTime() - REMINDER_WINDOW_MS);
  const isDue = now.getTime() >= dueAt.getTime() && now.getTime() < serviceStartAt.getTime();
  if (!isDue) return { bookingId, outcome: "skipped-not-due" };

  const attemptNumber = state.appointmentReminderAttempts + 1;

  const record = await repository.getFullBookingRecord(bookingId);
  if (!record) return { bookingId, outcome: "not-found" };

  // A fresh, independent Manage Booking token is minted for every attempt
  // — never a rotation of the original token (which cannot be recovered
  // from its stored hash), and never reused across attempts (the raw
  // value only ever exists in this request's memory, so a retry cannot
  // resend the *same* link even if it wanted to). Its hash is written
  // below regardless of send outcome, since the token had to be embedded
  // in the email body before the send was even attempted; this bounds the
  // system to at most one currently-valid *reminder-issued* token per
  // booking at a time (superseding any earlier attempt's), while never
  // touching the original booking-confirmation token's own hash column.
  const reminderToken = generateManageToken();
  const reminderTokenHash = hashManageToken(reminderToken);

  const sendResult = await notifications.sendAppointmentReminder(record, reminderToken);

  if (sendResult.ok) {
    try {
      await repository.updateAppointmentReminderStatus(bookingId, {
        appointmentReminderStatus: APPOINTMENT_REMINDER_STATUS.SENT,
        appointmentReminderSentAt: formatOperationalTimestamp(now),
        appointmentReminderAttempts: attemptNumber,
        manageBookingReminderTokenHash: reminderTokenHash,
      });
    } catch (error) {
      logError("updateAppointmentReminderStatus (sent)", bookingId, error);
    }
    try {
      const updated = await repository.getFullBookingRecord(bookingId);
      if (updated) await notifications.sendInternalReminderSent(updated);
    } catch (error) {
      logError("sendInternalReminderSent", bookingId, error);
    }
    return { bookingId, outcome: "sent", attempt: attemptNumber };
  }

  // Failure path. Only after the 3rd attempt does this become permanent
  // and alert BeLa — every earlier failure is silently retry-eligible on
  // the next hourly scheduler run, matching the approved policy.
  if (attemptNumber >= MAX_REMINDER_ATTEMPTS) {
    try {
      await repository.updateAppointmentReminderStatus(bookingId, {
        appointmentReminderStatus: APPOINTMENT_REMINDER_STATUS.FAILED,
        appointmentReminderSentAt: "",
        appointmentReminderAttempts: attemptNumber,
        manageBookingReminderTokenHash: reminderTokenHash,
      });
    } catch (error) {
      logError("updateAppointmentReminderStatus (failed)", bookingId, error);
    }
    try {
      const updated = await repository.getFullBookingRecord(bookingId);
      if (updated) await notifications.sendInternalReminderFailed(updated, attemptNumber);
    } catch (error) {
      logError("sendInternalReminderFailed", bookingId, error);
    }
    return { bookingId, outcome: "failed-permanently", attempt: attemptNumber };
  }

  try {
    await repository.updateAppointmentReminderStatus(bookingId, {
      appointmentReminderStatus: APPOINTMENT_REMINDER_STATUS.RETRY_SCHEDULED,
      appointmentReminderSentAt: "",
      appointmentReminderAttempts: attemptNumber,
      manageBookingReminderTokenHash: reminderTokenHash,
    });
  } catch (error) {
    logError("updateAppointmentReminderStatus (retry scheduled)", bookingId, error);
  }
  return { bookingId, outcome: "retry-scheduled", attempt: attemptNumber };
}

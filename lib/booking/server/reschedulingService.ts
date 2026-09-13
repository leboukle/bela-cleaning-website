// SERVER-ONLY. Orchestrates customer self-service rescheduling via a
// Manage Booking token. Reuses the exact same overlap/capacity-aware
// exact-time availability check (checkExactTimeAvailability) the booking
// flow uses — there is no second availability implementation. Capacity
// release/reservation needs no dedicated logic: availability.ts counts
// live bookings by scanning current Service Date + resolved start
// time/duration on every read, so overwriting Service Date/Service Start
// Time *is* the release-old/reserve-new operation.
//
// Milestone 6 amendment: rescheduling now always moves a booking to an
// exact date + start time, regardless of whether it started out as a
// legacy arrival-window booking or an already-exact-time one — see the
// write at the bottom, which always clears Arrival Window and sets
// Service Start Time. Original Service Date/Arrival Window/Service Start
// Time are still only ever captured once, on the booking's first
// reschedule ever.
import "server-only";
import { BOOKING_STATUS, PAYMENT_STATUS } from "./bookingsSheetSchema";
import { hashManageToken, isPlausibleManageToken } from "./manageToken";
import { getBookingTimingStatus } from "./cancellationPolicy";
import { checkExactTimeAvailability } from "./availability";
import { calculateScheduledChargeAt } from "./scheduledCharge";
import { getBookingSettings } from "./settings";
import { isValidDateKey, formatOperationalTimestamp } from "./dateUtils";
import { getAllExactStartTimeCandidates, isPlausibleExactTimeFormat } from "@/lib/booking/schedule";
import type { NotificationService } from "./notificationService";
import type { BookingRepository } from "./repository";

export type RescheduleNotificationSender = Pick<NotificationService, "sendRescheduleConfirmation" | "sendInternalRescheduleNotification">;

export type RescheduleBookingOutcome = "invalid-token" | "not-eligible" | "invalid-input" | "date-unavailable" | "rescheduled";

export type RescheduleBookingResult = {
  outcome: RescheduleBookingOutcome;
  bookingId?: string;
  serviceDate?: string;
  serviceStartTime?: string;
};

function logError(step: string, bookingId: string, error: unknown): void {
  console.error(`[reschedulingService] ${step} failed: bookingId=${bookingId}`, error instanceof Error ? error.message : "unknown error");
}

export async function rescheduleBookingByToken(
  token: string,
  newServiceDate: string,
  newServiceStartTime: string,
  repository: BookingRepository,
  notifications: RescheduleNotificationSender,
  now: Date = new Date(),
): Promise<RescheduleBookingResult> {
  if (!isPlausibleManageToken(token)) return { outcome: "invalid-token" };

  const bookingId = await repository.findBookingIdByManageTokenHash(hashManageToken(token));
  if (!bookingId) return { outcome: "invalid-token" };

  const record = await repository.getFullBookingRecord(bookingId);
  if (!record) return { outcome: "invalid-token" };

  if (record.bookingStatus === BOOKING_STATUS.CANCELLED) return { outcome: "not-eligible", bookingId };
  // Only a booking still in its pre-charge state is reschedule-eligible —
  // matches cancellationService.ts's identical guard and rationale.
  if (record.paymentStatus !== PAYMENT_STATUS.SCHEDULED) return { outcome: "not-eligible", bookingId };

  const settings = await getBookingSettings();
  const currentTiming = getBookingTimingStatus(record.serviceDate, record.serviceStartTime, record.arrivalWindow, settings.timezone, now);
  if (!currentTiming.isMoreThan24HoursOut) return { outcome: "not-eligible", bookingId };

  // Never trusts the new date/time from the client beyond format — the
  // same rules new bookings are held to. The standing 24-hour minimum-
  // lead-time rule (replacing the old day-granular minimumLeadDays
  // check — no longer consulted here), the "finishes by 8pm"/operating-
  // hours filter, and the real overlap/capacity decision all happen in
  // checkExactTimeAvailability below, using this booking's own (unchanged
  // by rescheduling) estimated duration.
  if (!isValidDateKey(newServiceDate)) {
    return { outcome: "invalid-input", bookingId };
  }
  if (!isPlausibleExactTimeFormat(newServiceStartTime) || !getAllExactStartTimeCandidates().includes(newServiceStartTime)) {
    return { outcome: "invalid-input", bookingId };
  }

  let availability;
  try {
    availability = await checkExactTimeAvailability(newServiceDate, newServiceStartTime, record.estimatedDurationMinutes, now);
  } catch (error) {
    logError("checkExactTimeAvailability", bookingId, error);
    throw error;
  }
  if (!availability.available) return { outcome: "date-unavailable", bookingId };

  // Immediate re-check right before writing — mirrors bookingService.ts's
  // own "recheck right before append" pattern for new bookings. The old
  // slot is never released before this passes: nothing is written until
  // both checks succeed, so an unavailable new slot always leaves the
  // existing booking completely untouched.
  let recheck;
  try {
    recheck = await checkExactTimeAvailability(newServiceDate, newServiceStartTime, record.estimatedDurationMinutes, now);
  } catch (error) {
    logError("checkExactTimeAvailability (recheck)", bookingId, error);
    throw error;
  }
  if (!recheck.available) return { outcome: "date-unavailable", bookingId };

  const newScheduledChargeAt = calculateScheduledChargeAt(
    newServiceDate,
    { hour: Number(newServiceStartTime.slice(0, 2)), minute: 0 },
    record.estimatedDurationMinutes,
    settings.timezone,
  );

  // Original Service Date/Arrival Window/Service Start Time are captured
  // only once, on the first reschedule ever — a blank originalServiceDate
  // means this is the first; on any later reschedule, the already-captured
  // original is written back unchanged rather than being overwritten with
  // the (already-once-rescheduled) current value.
  const isFirstReschedule = record.originalServiceDate === "";
  const originalServiceDate = isFirstReschedule ? record.serviceDate : record.originalServiceDate;
  const originalArrivalWindow = isFirstReschedule ? record.arrivalWindow : record.originalArrivalWindow;
  const originalServiceStartTime = isFirstReschedule ? record.serviceStartTime : record.originalServiceStartTime;

  const change = { oldServiceDate: record.serviceDate, oldArrivalWindow: record.arrivalWindow, oldServiceStartTime: record.serviceStartTime };

  try {
    await repository.updateBookingReschedule(bookingId, {
      serviceDate: newServiceDate,
      // Always cleared going forward — Service Start Time becomes the
      // row's sole authoritative current time after any reschedule, even
      // if the booking started out as a legacy arrival-window row.
      arrivalWindow: "",
      serviceStartTime: newServiceStartTime,
      scheduledChargeAt: newScheduledChargeAt.toISOString(),
      rescheduledAt: formatOperationalTimestamp(now),
      originalServiceDate,
      originalArrivalWindow,
      originalServiceStartTime,
    });
  } catch (error) {
    logError("updateBookingReschedule", bookingId, error);
    throw error;
  }

  try {
    const updated = await repository.getFullBookingRecord(bookingId);
    if (updated) {
      await Promise.allSettled([
        notifications.sendRescheduleConfirmation(updated, change),
        notifications.sendInternalRescheduleNotification(updated, change),
      ]);
    }
  } catch (error) {
    logError("reschedule notifications", bookingId, error);
  }

  return { outcome: "rescheduled", bookingId, serviceDate: newServiceDate, serviceStartTime: newServiceStartTime };
}

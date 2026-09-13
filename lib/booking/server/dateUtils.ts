// SERVER-ONLY. Timezone-aware date helpers used by scheduling validation.
// The rest of the app treats dates as zone-naive "yyyy-mm-dd" keys (see
// lib/booking/schedule.ts); the one place that genuinely needs to know
// *which* timezone "today" is in is the server, since it must compute the
// authoritative lead-time window using the business's configured zone
// (Settings.timezone) rather than the server process's own local time.
import "server-only";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Strict "yyyy-mm-dd" format check plus a real-calendar-date round trip
 * (rejects e.g. "2026-02-30"). */
export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_REGEX.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** "Today" as a yyyy-mm-dd key in the given IANA timezone. */
export function getTodayDateKeyInTimezone(timezone: string): string {
  // en-CA formats as yyyy-mm-dd, which is convenient and avoids hand
  // parsing locale-specific month/day ordering.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * True when `dateKey` is strictly before "today" or falls inside the
 * minimum-lead-time window (both computed in the configured timezone).
 */
export function isPastOrWithinLeadWindow(dateKey: string, timezone: string, minimumLeadDays: number): boolean {
  const todayKey = getTodayDateKeyInTimezone(timezone);
  const earliestSelectableKey = addDaysToDateKey(todayKey, minimumLeadDays);
  return dateKey < earliestSelectableKey;
}

// Standing minimum-lead-time rule (replaces the day-granular check above
// for booking/rescheduling eligibility — see availability.ts's
// checkExactTimeAvailability/getAvailableStartTimes, the sole consumers):
// a candidate appointment must start at least this many hours from the
// moment of booking. Instant-based, not day-granular, so it correctly
// accounts for the exact selected start time rather than just the
// calendar date. `serviceStart` must already be the real, DST-safe UTC
// instant — see serviceTime.ts's calculateServiceStart — never
// recomputed here.
export const MINIMUM_LEAD_TIME_HOURS = 24;

/** True when `serviceStart` is less than MINIMUM_LEAD_TIME_HOURS from `now`. */
export function isLessThanMinimumLeadTime(serviceStart: Date, now: Date = new Date()): boolean {
  return serviceStart.getTime() - now.getTime() < MINIMUM_LEAD_TIME_HOURS * 60 * 60 * 1000;
}

// Human-readable operational-timestamp formatting (BeLa operates in New
// Jersey). This is a *display* concern only — the underlying instant is
// never altered, and this must never be used for any field the app or
// Apps Script re-parses for scheduling (Scheduled Charge At, Next Payment
// Attempt At — see paymentProcessingService.ts/reminderService.ts and
// both apps-script/*.gs files), only for pure audit-trail fields like
// Cancelled At/Paid At/Rescheduled At/Submitted At/Appointment Reminder
// Sent At. `timeZoneName: "short"` combined with the IANA zone resolves
// EST vs. EDT automatically for the given date — no manual DST handling.
export function formatOperationalTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

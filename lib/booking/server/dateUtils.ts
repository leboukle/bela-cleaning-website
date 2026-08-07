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

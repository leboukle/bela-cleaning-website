// Centralized scheduling rules for the booking prototype's appointment
// calendar: how far out a customer may book, the arrival-window catalog,
// and date-key helpers. Kept separate from pricing config since these are
// availability rules, not cost rules.
import type { ArrivalWindowId } from "./types";

// Standing minimum-lead-time rule: an appointment must start at least
// this many hours from the moment of booking (exactly 120h is eligible).
// This mirrors the authoritative server-side rule in
// lib/booking/server/dateUtils.ts (MINIMUM_LEAD_TIME_HOURS) — kept as a
// separate constant here since this file is client-facing UX only and the
// server never trusts anything computed in this module. Replaces the old
// day-granular MIN_LEAD_DAYS constant.
export const MINIMUM_LEAD_HOURS = 120;
export const MAX_MONTHS_AHEAD = 6;

export type ArrivalWindowOption = {
  id: ArrivalWindowId;
  label: string;
  timeRangeLabel: string;
};

export const ARRIVAL_WINDOWS: ArrivalWindowOption[] = [
  { id: "morning", label: "Morning", timeRangeLabel: "8:00 AM – 10:00 AM" },
  { id: "midday", label: "Midday", timeRangeLabel: "10:00 AM – 12:00 PM" },
  { id: "early-afternoon", label: "Early Afternoon", timeRangeLabel: "12:00 PM – 2:00 PM" },
  { id: "afternoon", label: "Afternoon", timeRangeLabel: "2:00 PM – 4:00 PM" },
];

export function getArrivalWindowOption(id: ArrivalWindowId): ArrivalWindowOption {
  const option = ARRIVAL_WINDOWS.find((o) => o.id === id);
  if (!option) throw new Error(`Unknown arrival window: ${id}`);
  return option;
}

// The Bookings sheet stores the display label ("Morning"), not the raw ID
// — this is the reverse lookup Milestone 6's cancellation/reschedule
// timing logic needs to turn a persisted record back into an ArrivalWindowId
// before it can compute a real-world start time. Returns null rather than
// throwing so callers can produce a clear server-error response instead of
// an unhandled exception for a row with an unexpected label.
export function getArrivalWindowIdByLabel(label: string): ArrivalWindowId | null {
  return ARRIVAL_WINDOWS.find((o) => o.label === label)?.id ?? null;
}

// ---- Exact appointment start times (Milestone 6 amendment) ----
// Replaces broad Arrival Window selection for new bookings going forward.
// Business-approved operating rules: hourly increments, no lunch
// exclusion, earliest start 9:00 AM, latest possible start 4:00 PM, and
// every cleaning must finish by 8:00 PM — so a start time's actual
// availability also depends on the booking's estimated duration (see
// filterStartTimesByDuration below). These constants are the single
// source of truth for both the client picker and the server's
// authoritative validation (lib/booking/server/exactTime.ts,
// lib/booking/server/availability.ts) — never duplicated.
// Earliest start moved from 8:00 AM to 9:00 AM for NEW availability only.
// Existing bookings keep whatever Service Start Time / Arrival Window they
// were stored with — nothing re-validates a persisted booking against this
// constant (it only gates getAllExactStartTimeCandidates(), which feeds new
// bookings and a reschedule's new target slot). The legacy ARRIVAL_WINDOWS
// above intentionally still describe the old 8:00 AM "Morning" window.
export const OPERATING_START_HOUR = 9; // 9:00 AM, earliest selectable start
export const OPERATING_LATEST_START_HOUR = 16; // 4:00 PM, latest possible start
export const OPERATING_CLOSE_HOUR = 20; // 8:00 PM — every cleaning must finish by this time
export const START_TIME_STEP_MINUTES = 60;

const EXACT_TIME_REGEX = /^([01]\d|2[0-3]):00$/;

/** Every hourly mark BeLa could ever offer as a start time, before duration/availability filtering. */
export function getAllExactStartTimeCandidates(): string[] {
  const times: string[] = [];
  for (let hour = OPERATING_START_HOUR; hour <= OPERATING_LATEST_START_HOUR; hour++) {
    times.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return times;
}

/** True only for a canonical "HH:00" string on an hourly mark — not a full range/business-hours check. */
export function isPlausibleExactTimeFormat(value: string): boolean {
  return EXACT_TIME_REGEX.test(value);
}

/**
 * Narrows a candidate list to start times whose service would actually
 * finish by OPERATING_CLOSE_HOUR given `estimatedDurationMinutes` — e.g. a
 * 5-hour cleaning cannot start at 4:00 PM (would end at 9:00 PM). Pure
 * duration/operating-hours math only; the live overlap/capacity check
 * against other bookings happens server-side (see availability.ts).
 */
export function filterStartTimesByDuration(candidates: string[], estimatedDurationMinutes: number): string[] {
  const closeMinutes = OPERATING_CLOSE_HOUR * 60;
  return candidates.filter((time) => {
    const hour = Number(time.slice(0, 2));
    return hour * 60 + estimatedDurationMinutes <= closeMinutes;
  });
}

/** "09:00" -> "9:00 AM". Assumes a canonical "HH:00" string (see isPlausibleExactTimeFormat). */
export function formatExactTime(time: string): string {
  const hour = Number(time.slice(0, 2));
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:00 ${period}`;
}

/**
 * The single "what time does this booking show as" resolver for anything
 * customer- or staff-facing (UI, emails, Manage Booking) — prefers the
 * exact Service Start Time when populated ("9:00 AM"), falling back to
 * the legacy Arrival Window's label + range ("Morning (8:00 AM – 10:00 AM)")
 * otherwise. Mirrors serviceTime.ts's resolveRecordStartSpec (the
 * server-only equivalent used for real timing math) but is itself
 * client-safe pure string logic — no server-only import, no DST/UTC
 * conversion, since it only ever formats already-persisted display values.
 */
export function getScheduleDisplayLabel(record: { serviceStartTime: string; arrivalWindow: string }): string {
  if (record.serviceStartTime) return formatExactTime(record.serviceStartTime);
  if (!record.arrivalWindow) return "—";
  const option = ARRIVAL_WINDOWS.find((o) => o.label === record.arrivalWindow);
  return option ? `${option.label} (${option.timeRangeLabel})` : record.arrivalWindow;
}

// ---- Date helpers ----
// Dates are represented as "yyyy-mm-dd" strings interpreted as local
// calendar dates — never as UTC ISO timestamps — since a customer picking
// "Tuesday, August 18" means their own local day regardless of the
// browser's timezone offset.

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isAtLeastLeadHoursAway(day: Date, startHour: number, now: Date): boolean {
  const windowStart = new Date(day);
  windowStart.setHours(startHour, 0, 0, 0);
  return windowStart.getTime() - now.getTime() >= MINIMUM_LEAD_HOURS * 60 * 60 * 1000;
}

/**
 * Earliest calendar date on which at least one exact start time could
 * still satisfy the 120-hour minimum lead time, using the latest possible
 * offered start (OPERATING_LATEST_START_HOUR, 4:00 PM) as the permissive
 * per-date gate — the customer picks the specific exact time in the next
 * step (StartTimeStep.tsx), which fetches the real, authoritative,
 * already-120h-filtered list from /api/booking/available-times
 * (availability.ts's getAvailableStartTimes); this is only a calendar-
 * level hint so the customer isn't invited to pick a date that would show
 * zero available times.
 */
export function getMinSelectableDate(today: Date = new Date()): Date {
  const candidate = startOfDay(today);
  while (!isAtLeastLeadHoursAway(candidate, OPERATING_LATEST_START_HOUR, today)) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

export function getMaxSelectableDate(today: Date = new Date()): Date {
  const max = startOfDay(today);
  max.setMonth(max.getMonth() + MAX_MONTHS_AHEAD);
  return max;
}

export function isDateSelectable(
  date: Date,
  options: { today?: Date; unavailableDateKeys?: string[] } = {},
): boolean {
  const today = options.today ?? new Date();
  const min = getMinSelectableDate(today);
  const max = getMaxSelectableDate(today);
  const day = startOfDay(date);
  if (day < min || day > max) return false;
  if (options.unavailableDateKeys?.includes(toDateKey(day))) return false;
  return true;
}

export function formatReadableDate(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

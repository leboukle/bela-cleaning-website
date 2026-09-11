// Centralized scheduling rules for the booking prototype's appointment
// calendar: how far out a customer may book, the arrival-window catalog,
// and date-key helpers. Kept separate from pricing config since these are
// availability rules, not cost rules.
import type { ArrivalWindowId } from "./types";

// Standing minimum-lead-time rule: an appointment must start at least this
// many hours from the moment of booking (exactly 24h is eligible). This
// mirrors the authoritative server-side rule in
// lib/booking/server/dateUtils.ts (MINIMUM_LEAD_TIME_HOURS) — kept as a
// separate constant here since this file is client-facing UX only and the
// server never trusts anything computed in this module.
export const MINIMUM_LEAD_HOURS = 24;
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

// Non-authoritative client-side mirror of each arrival window's start hour
// (all start on the hour), used only to give the Calendar and
// arrival-window UI an accurate 24-hour lead-time hint. The server
// independently re-derives and enforces the real start time in
// scheduledCharge.ts/validateSubmission.ts — this copy is never trusted and
// carries no timezone conversion (it compares against the browser's own
// local clock, same as the rest of this file).
const ARRIVAL_WINDOW_START_HOUR: Record<ArrivalWindowId, number> = {
  morning: 8,
  midday: 10,
  "early-afternoon": 12,
  afternoon: 14,
};

export function getArrivalWindowOption(id: ArrivalWindowId): ArrivalWindowOption {
  const option = ARRIVAL_WINDOWS.find((o) => o.id === id);
  if (!option) throw new Error(`Unknown arrival window: ${id}`);
  return option;
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
 * Earliest calendar date on which at least one arrival window could still
 * satisfy the 24-hour minimum lead time, using the latest window
 * (Afternoon, 2:00 PM) as the permissive per-date gate — the customer picks
 * the specific window in a later step, and submission is re-checked
 * per-window, server-side, regardless of this hint.
 */
export function getMinSelectableDate(today: Date = new Date()): Date {
  const latestStartHour = ARRIVAL_WINDOW_START_HOUR.afternoon;
  const candidate = startOfDay(today);
  while (!isAtLeastLeadHoursAway(candidate, latestStartHour, today)) {
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

/**
 * Whether a specific arrival window on a specific date still satisfies the
 * 24-hour minimum lead time, per this client-side (non-authoritative) hint.
 * Used to disable individual arrival-window options on the boundary date
 * (e.g. the earliest selectable date, where earlier windows may already be
 * too soon even though a later one still qualifies).
 */
export function isArrivalWindowSelectable(
  dateKey: string,
  windowId: ArrivalWindowId,
  today: Date = new Date(),
): boolean {
  const day = fromDateKey(dateKey);
  return isAtLeastLeadHoursAway(day, ARRIVAL_WINDOW_START_HOUR[windowId], today);
}

export function formatReadableDate(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

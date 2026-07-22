// Centralized scheduling rules for the booking prototype's appointment
// calendar: how far out a customer may book, the arrival-window catalog,
// and date-key helpers. Kept separate from pricing config since these are
// availability rules, not cost rules.
import type { ArrivalWindowId } from "./types";

export const MIN_LEAD_DAYS = 7;
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

export function getMinSelectableDate(today: Date = new Date()): Date {
  const min = startOfDay(today);
  min.setDate(min.getDate() + MIN_LEAD_DAYS);
  return min;
}

export function getMaxSelectableDate(today: Date = new Date()): Date {
  const max = startOfDay(today);
  max.setMonth(max.getMonth() + MAX_MONTHS_AHEAD);
  return max;
}

// DEV-ONLY MOCK DATA — this stands in for a later milestone's real
// availability/capacity lookup (e.g. "two bookings per day" once a
// database exists). It exists solely so the calendar's disabled-date
// styling and logic can be exercised before there is anything real to
// disable. Remove this function (and its one call site in
// ScheduleDateStep) once real availability data is wired up; nothing else
// in the calendar depends on dates being mocked versus real — it only
// consumes a plain `unavailableDateKeys: string[]`.
export function getMockUnavailableDateKeys(today: Date = new Date()): string[] {
  const min = getMinSelectableDate(today);
  const thirdSelectableDay = new Date(min);
  thirdSelectableDay.setDate(thirdSelectableDay.getDate() + 2);
  const tenthSelectableDay = new Date(min);
  tenthSelectableDay.setDate(tenthSelectableDay.getDate() + 9);
  return [toDateKey(thirdSelectableDay), toDateKey(tenthSelectableDay)];
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

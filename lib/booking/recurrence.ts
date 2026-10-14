// Recurring-schedule cadence: which calendar date each appointment of a
// schedule falls on. Pure date-key arithmetic (yyyy-mm-dd), no clocks and
// no timezones — every occurrence is derived from the schedule's ORIGINAL
// anchor date, never from the previous occurrence, so rescheduling or
// skipping one appointment can never shift the series, and a short month
// never permanently drags a monthly series to an earlier day.
//
// The wall-clock start time is stored once on the schedule (e.g. "09:00")
// and converted to an absolute instant per occurrence in the business
// timezone (America/New_York) by serviceTime.ts's calculateServiceStart,
// which re-derives the UTC offset for that specific date — so local time
// is preserved across DST changes.
import { FREQUENCY_OPTIONS } from "./config";
import type { FrequencyId } from "./types";

export type RecurringCadence = "weekly" | "biweekly" | "monthly";

const DAYS_BETWEEN_OCCURRENCES: Record<Exclude<RecurringCadence, "monthly">, number> = {
  weekly: 7,
  biweekly: 14,
};

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return toDateKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function isRecurringCadence(frequency: FrequencyId | string | null | undefined): frequency is RecurringCadence {
  return frequency === "weekly" || frequency === "biweekly" || frequency === "monthly";
}

/** Maps a persisted frequency label ("Weekly", "Every other week", "Monthly") back to its id. */
export function getFrequencyIdForLabel(label: string): FrequencyId | null {
  return FREQUENCY_OPTIONS.find((option) => option.label === label)?.id ?? null;
}

/**
 * The service date of occurrence `occurrenceNumber` (1 = the anchor date
 * itself) of a schedule anchored at `anchorDateKey`.
 *
 *  - weekly:   every 7 days.
 *  - biweekly: every 14 days.
 *  - monthly:  the same numbered calendar date each month. An anchor on the
 *    29th–31st is clamped to the last day of any shorter month and returns
 *    to the anchor day in longer months (Jan 31 → Feb 28/29 → Mar 31).
 */
export function getOccurrenceDateKey(
  anchorDateKey: string,
  cadence: FrequencyId | string,
  occurrenceNumber: number,
): string {
  if (!Number.isInteger(occurrenceNumber) || occurrenceNumber < 1) {
    throw new Error(`Invalid occurrence number: ${occurrenceNumber}`);
  }
  if (!isRecurringCadence(cadence)) {
    throw new Error(`Not a recurring cadence: ${cadence}`);
  }
  const steps = occurrenceNumber - 1;
  if (cadence === "monthly") {
    const { year, month, day } = parseDateKey(anchorDateKey);
    const monthIndex = month - 1 + steps;
    const targetYear = year + Math.floor(monthIndex / 12);
    const targetMonth = (monthIndex % 12) + 1;
    return toDateKey(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
  }
  return addDaysToDateKey(anchorDateKey, DAYS_BETWEEN_OCCURRENCES[cadence] * steps);
}

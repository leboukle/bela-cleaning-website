// SERVER-ONLY. Blackout dates, availability overrides, and daily-capacity
// counting (STEPS 5-7). The frontend calendar must never be trusted for
// availability — every function here is also the source of truth for the
// booking-submission validation path.
import "server-only";
import { batchGetRanges, getRange } from "./sheetsClient";
import { getBookingSettings, type BookingSettings } from "./settings";
import { BOOKING_STATUS, BOOKINGS_SHEET_NAME, columnLetter } from "./bookingsSheetSchema";

export class AvailabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvailabilityError";
  }
}

// Only the columns each read needs — never the whole sheet.
const BLACKOUT_RANGE = "Blackout Dates!A2:C"; // Date, Reason, Active
const OVERRIDES_RANGE = "Availability Overrides!A2:D"; // Date, Maximum Bookings, Reason, Active

function isActiveFlag(raw: string | undefined): boolean {
  return (raw ?? "").trim().toUpperCase() === "TRUE";
}

function normalizeDateCell(raw: string | undefined): string {
  return (raw ?? "").trim();
}

export async function getActiveBlackoutDateSet(): Promise<Set<string>> {
  const rows = await getRange(BLACKOUT_RANGE);
  const dates = new Set<string>();
  for (const row of rows) {
    const [date, , active] = row;
    const key = normalizeDateCell(date);
    if (key && isActiveFlag(active)) dates.add(key);
  }
  return dates;
}

type OverrideMap = Map<string, number>;

async function getActiveOverrideMap(): Promise<OverrideMap> {
  const rows = await getRange(OVERRIDES_RANGE);
  const overrides: OverrideMap = new Map();
  for (const row of rows) {
    const [date, maxBookingsRaw, , active] = row;
    const key = normalizeDateCell(date);
    if (!key || !isActiveFlag(active)) continue;
    const maxBookings = Number(maxBookingsRaw);
    if (!Number.isInteger(maxBookings) || maxBookings < 0) {
      throw new AvailabilityError(`Malformed Availability Overrides value for ${key}: "${maxBookingsRaw}".`);
    }
    overrides.set(key, maxBookings);
  }
  return overrides;
}

/** Per-date active-booking counts (excludes only "Cancelled") in one read. */
async function getActiveBookingCountsByDate(): Promise<Map<string, number>> {
  const dateRange = `${BOOKINGS_SHEET_NAME}!${columnLetter("Service Date")}2:${columnLetter("Service Date")}`;
  const statusRange = `${BOOKINGS_SHEET_NAME}!${columnLetter("Booking Status")}2:${columnLetter("Booking Status")}`;
  const [dates, statuses] = await batchGetRanges([dateRange, statusRange]);

  const counts = new Map<string, number>();
  const rowCount = Math.max(dates.length, statuses.length);
  for (let i = 0; i < rowCount; i++) {
    const date = normalizeDateCell(dates[i]?.[0]);
    const status = normalizeDateCell(statuses[i]?.[0]);
    if (!date || status === BOOKING_STATUS.CANCELLED) continue;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return counts;
}

function effectiveCapacity(dateKey: string, overrides: OverrideMap, settings: BookingSettings): number {
  return overrides.has(dateKey) ? (overrides.get(dateKey) as number) : settings.defaultDailyCapacity;
}

export type AvailabilityResult = {
  available: boolean;
  reason: "blackout" | "at-capacity" | null;
  maxCapacity: number;
  currentCount: number;
};

/**
 * Single-date authoritative availability check, used during booking
 * submission (and re-run immediately before the append — see
 * bookingService.ts). Independent of anything the browser calculated.
 */
export async function checkDateAvailability(dateKey: string): Promise<AvailabilityResult> {
  const settings = await getBookingSettings();
  const [blackoutDates, overrides, counts] = await Promise.all([
    getActiveBlackoutDateSet(),
    getActiveOverrideMap(),
    getActiveBookingCountsByDate(),
  ]);

  const maxCapacity = effectiveCapacity(dateKey, overrides, settings);
  const currentCount = counts.get(dateKey) ?? 0;

  if (blackoutDates.has(dateKey)) {
    return { available: false, reason: "blackout", maxCapacity, currentCount };
  }
  if (currentCount >= maxCapacity) {
    return { available: false, reason: "at-capacity", maxCapacity, currentCount };
  }
  return { available: true, reason: null, maxCapacity, currentCount };
}

/**
 * Returns every unavailable date key (blackout OR at/over capacity) within
 * [startDateKey, endDateKey] inclusive, computed from a small constant
 * number of Sheets reads regardless of window size — the per-date
 * comparison happens in memory. Used by the public availability endpoint
 * that feeds the calendar; never returns booking counts or any customer
 * detail, only date keys.
 */
export async function getUnavailableDateKeysInWindow(startDateKey: string, endDateKey: string): Promise<string[]> {
  const settings = await getBookingSettings();
  const [blackoutDates, overrides, counts] = await Promise.all([
    getActiveBlackoutDateSet(),
    getActiveOverrideMap(),
    getActiveBookingCountsByDate(),
  ]);

  const unavailable = new Set<string>(blackoutDates);
  for (const [dateKey, count] of counts) {
    if (dateKey < startDateKey || dateKey > endDateKey) continue;
    if (count >= effectiveCapacity(dateKey, overrides, settings)) {
      unavailable.add(dateKey);
    }
  }
  // Also cover dates with an explicit zero-capacity override but zero
  // current bookings (count map wouldn't otherwise mention them).
  for (const [dateKey, maxBookings] of overrides) {
    if (dateKey < startDateKey || dateKey > endDateKey) continue;
    if (maxBookings <= 0) unavailable.add(dateKey);
  }

  return Array.from(unavailable).filter((key) => key >= startDateKey && key <= endDateKey);
}

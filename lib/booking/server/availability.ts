// SERVER-ONLY. Blackout dates, availability overrides, and daily-capacity
// counting (STEPS 5-7). The frontend calendar must never be trusted for
// availability — every function here is also the source of truth for the
// booking-submission validation path.
//
// Milestone 6 amendment: exact appointment start times also need to know
// whether a *specific interval* within a day would push simultaneous
// active bookings over that date's existing capacity — see
// checkExactTimeAvailability/getAvailableStartTimes below. This reuses
// the exact same blackout/override/capacity data this file already reads
// for the day-level check; it does not introduce a second capacity model
// or any cleaner-specific assignment, only finer-grained (interval-aware,
// not per-slot-exclusive) counting against the same single capacity
// number.
import "server-only";
import { batchGetRanges, getRange } from "./sheetsClient";
import { getBookingSettings, type BookingSettings } from "./settings";
import { BOOKING_STATUS, BOOKINGS_SHEET_NAME, columnLetter } from "./bookingsSheetSchema";
import { calculateServiceStart, resolveRecordStartSpec, ServiceTimeError } from "./serviceTime";
import { isLessThanMinimumLeadTime } from "./dateUtils";
import { filterStartTimesByDuration, getAllExactStartTimeCandidates, isPlausibleExactTimeFormat } from "@/lib/booking/schedule";

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

type BookingInterval = { startMinutes: number; endMinutes: number };

/**
 * Per-date lists of active (non-cancelled) bookings' [start, end) minute
 * intervals, resolved via resolveRecordStartSpec so both exact-time and
 * legacy arrival-window rows are represented uniformly. A malformed
 * individual row (unrecognized label, bad time format) is skipped rather
 * than failing the whole read — availability must never go down because
 * of one bad historical row.
 */
async function getActiveBookingIntervalsByDate(): Promise<Map<string, BookingInterval[]>> {
  const [dates, statuses, arrivalWindows, startTimes, durations] = await batchGetRanges([
    `${BOOKINGS_SHEET_NAME}!${columnLetter("Service Date")}2:${columnLetter("Service Date")}`,
    `${BOOKINGS_SHEET_NAME}!${columnLetter("Booking Status")}2:${columnLetter("Booking Status")}`,
    `${BOOKINGS_SHEET_NAME}!${columnLetter("Arrival Window")}2:${columnLetter("Arrival Window")}`,
    `${BOOKINGS_SHEET_NAME}!${columnLetter("Service Start Time")}2:${columnLetter("Service Start Time")}`,
    `${BOOKINGS_SHEET_NAME}!${columnLetter("Estimated Duration Minutes")}2:${columnLetter("Estimated Duration Minutes")}`,
  ]);

  const intervalsByDate = new Map<string, BookingInterval[]>();
  const rowCount = Math.max(dates.length, statuses.length, arrivalWindows.length, startTimes.length, durations.length);

  for (let i = 0; i < rowCount; i++) {
    const date = normalizeDateCell(dates[i]?.[0]);
    const status = normalizeDateCell(statuses[i]?.[0]);
    if (!date || status === BOOKING_STATUS.CANCELLED) continue;

    const durationMinutes = Number(durations[i]?.[0]);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) continue;

    let spec;
    try {
      spec = resolveRecordStartSpec({
        serviceStartTime: normalizeDateCell(startTimes[i]?.[0]),
        arrivalWindow: normalizeDateCell(arrivalWindows[i]?.[0]),
      });
    } catch (error) {
      if (error instanceof ServiceTimeError) continue; // defensive skip — see docstring
      throw error;
    }

    const startMinutes = spec.hour * 60 + spec.minute;
    const interval: BookingInterval = { startMinutes, endMinutes: startMinutes + durationMinutes };
    const existing = intervalsByDate.get(date);
    if (existing) existing.push(interval);
    else intervalsByDate.set(date, [interval]);
  }

  return intervalsByDate;
}

/**
 * The peak number of simultaneously-active bookings (including the
 * candidate interval itself) at any instant during [candidateStart,
 * candidateEnd) — the maximum of "existing" only changes at an existing
 * booking's own start/end, so it's enough to sample at candidateStart and
 * at every existing interval's start that falls strictly inside the
 * candidate's span.
 */
function peakConcurrentCount(existing: BookingInterval[], candidateStart: number, candidateEnd: number): number {
  const overlapping = existing.filter((iv) => iv.startMinutes < candidateEnd && iv.endMinutes > candidateStart);
  const sampleInstants = new Set<number>([candidateStart, ...overlapping.map((iv) => Math.max(iv.startMinutes, candidateStart))]);

  let peak = 0;
  for (const instant of sampleInstants) {
    const activeAtInstant = 1 + overlapping.filter((iv) => iv.startMinutes <= instant && iv.endMinutes > instant).length;
    peak = Math.max(peak, activeAtInstant);
  }
  return peak;
}

export type ExactTimeAvailabilityResult = {
  available: boolean;
  reason: "blackout" | "outside-operating-hours" | "too-soon" | "at-capacity" | null;
  maxCapacity: number;
  peakConcurrentCount: number;
};

/**
 * Authoritative single-slot availability check for an exact appointment
 * start time (Milestone 6 amendment) — used at booking submission and
 * rescheduling (and re-run immediately before the write, mirroring
 * checkDateAvailability's own "recheck right before append" pattern).
 * Reuses the exact same blackout/override/default-capacity data
 * checkDateAvailability does; the only new logic is comparing the
 * candidate interval's peak concurrency (including bookings already on
 * the books) against that same single capacity number, instead of a
 * simple whole-day count. Never trusts a client-supplied "available"
 * claim — always re-reads current Sheets state.
 *
 * Also enforces the standing minimum-lead-time rule (the candidate start
 * must be >= MINIMUM_LEAD_TIME_HOURS from `now`): checked first, cheaply,
 * before any Sheets read, using the exact same DST-safe start-time
 * resolution (serviceTime.ts) every other timing-sensitive consumer
 * shares — never a second, duplicated conversion. This replaces the old
 * day-granular minimumLeadDays check for both new bookings and
 * rescheduling; that setting is no longer consulted for eligibility.
 */
export async function checkExactTimeAvailability(
  dateKey: string,
  startTime: string,
  estimatedDurationMinutes: number,
  now: Date = new Date(),
): Promise<ExactTimeAvailabilityResult> {
  const settings = await getBookingSettings();

  if (
    !isPlausibleExactTimeFormat(startTime) ||
    !getAllExactStartTimeCandidates().includes(startTime) ||
    filterStartTimesByDuration([startTime], estimatedDurationMinutes).length === 0
  ) {
    return { available: false, reason: "outside-operating-hours", maxCapacity: settings.defaultDailyCapacity, peakConcurrentCount: 0 };
  }

  const candidateStart = calculateServiceStart(dateKey, resolveRecordStartSpec({ serviceStartTime: startTime, arrivalWindow: "" }), settings.timezone);
  if (isLessThanMinimumLeadTime(candidateStart, now)) {
    return { available: false, reason: "too-soon", maxCapacity: settings.defaultDailyCapacity, peakConcurrentCount: 0 };
  }

  const [blackoutDates, overrides, intervalsByDate] = await Promise.all([
    getActiveBlackoutDateSet(),
    getActiveOverrideMap(),
    getActiveBookingIntervalsByDate(),
  ]);

  const maxCapacity = effectiveCapacity(dateKey, overrides, settings);

  if (blackoutDates.has(dateKey)) {
    return { available: false, reason: "blackout", maxCapacity, peakConcurrentCount: 0 };
  }

  const startMinutes = Number(startTime.slice(0, 2)) * 60;
  const endMinutes = startMinutes + estimatedDurationMinutes;
  const peak = peakConcurrentCount(intervalsByDate.get(dateKey) ?? [], startMinutes, endMinutes);

  if (peak > maxCapacity) {
    return { available: false, reason: "at-capacity", maxCapacity, peakConcurrentCount: peak };
  }
  return { available: true, reason: null, maxCapacity, peakConcurrentCount: peak };
}

/**
 * Every exact start time BeLa can currently offer for `dateKey` given
 * `estimatedDurationMinutes` — the operating-hours/duration filter from
 * lib/booking/schedule.ts, narrowed further by the same overlap/capacity
 * rule checkExactTimeAvailability applies, computed from one shared data
 * fetch rather than one Sheets round trip per candidate hour.
 *
 * Also excludes any candidate less than MINIMUM_LEAD_TIME_HOURS from
 * `now` (see checkExactTimeAvailability's docstring) — this is what keeps
 * StartTimeStep.tsx from ever offering a time the server would reject on
 * submission; the server never trusts this list back regardless.
 */
export async function getAvailableStartTimes(dateKey: string, estimatedDurationMinutes: number, now: Date = new Date()): Promise<string[]> {
  const settings = await getBookingSettings();
  const candidates = filterStartTimesByDuration(getAllExactStartTimeCandidates(), estimatedDurationMinutes).filter((time) => {
    const candidateStart = calculateServiceStart(dateKey, resolveRecordStartSpec({ serviceStartTime: time, arrivalWindow: "" }), settings.timezone);
    return !isLessThanMinimumLeadTime(candidateStart, now);
  });
  if (candidates.length === 0) return [];

  const [blackoutDates, overrides, intervalsByDate] = await Promise.all([
    getActiveBlackoutDateSet(),
    getActiveOverrideMap(),
    getActiveBookingIntervalsByDate(),
  ]);

  if (blackoutDates.has(dateKey)) return [];

  const maxCapacity = effectiveCapacity(dateKey, overrides, settings);
  const existing = intervalsByDate.get(dateKey) ?? [];

  return candidates.filter((time) => {
    const startMinutes = Number(time.slice(0, 2)) * 60;
    const endMinutes = startMinutes + estimatedDurationMinutes;
    return peakConcurrentCount(existing, startMinutes, endMinutes) <= maxCapacity;
  });
}

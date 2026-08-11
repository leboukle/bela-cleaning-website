// SERVER-ONLY. Computes the authoritative automatic-charge timestamp:
//
//   Scheduled Charge At = service date + arrival-window start time
//                          + estimated duration + 1 hour
//
// Always computed server-side (never trust a browser-computed value) and
// always in the business's configured timezone (Settings.timezone,
// currently America/New_York) — the milestone's own example: an 8:00 AM
// start with a 4-hour estimated duration schedules the charge for 1:00 PM
// *local* time, correctly shifted across DST transitions because the
// wall-clock-to-UTC conversion below re-derives the real UTC offset for
// the specific calendar date in question, rather than assuming a fixed
// offset.
import "server-only";
import type { ArrivalWindowId } from "@/lib/booking/types";

const CHARGE_DELAY_AFTER_END_MINUTES = 60;

// Arrival-window start times, 24-hour clock, local to the business's
// timezone. Deliberately a small server-only lookup rather than adding
// these to lib/booking/schedule.ts's client-facing ARRIVAL_WINDOWS array —
// this data is specific to server-side charge-time math, not to anything
// the browser needs to display (the display label's time range already
// conveys the same start time to the customer in schedule.ts).
const ARRIVAL_WINDOW_START_TIME: Record<ArrivalWindowId, { hour: number; minute: number }> = {
  morning: { hour: 8, minute: 0 },
  midday: { hour: 10, minute: 0 },
  "early-afternoon": { hour: 12, minute: 0 },
  afternoon: { hour: 14, minute: 0 },
};

/**
 * Converts a wall-clock date/time in a given IANA timezone to the
 * corresponding UTC instant, correctly across DST transitions. There is
 * no built-in JS API for this reverse direction (Intl.DateTimeFormat only
 * converts UTC -> zoned, not zoned -> UTC), so this uses the standard
 * two-pass convergence technique: guess assuming the wall time was UTC,
 * see what that guess actually displays as in the target zone, and
 * correct by the difference. A second pass handles the rare case where
 * the correction itself crosses a DST boundary.
 */
function zonedWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  let utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const desiredMs = utcGuessMs;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let i = 0; i < 2; i++) {
    const parts = formatter.formatToParts(new Date(utcGuessMs));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const formattedMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    utcGuessMs += desiredMs - formattedMs;
  }

  return new Date(utcGuessMs);
}

export function calculateScheduledChargeAt(
  serviceDateKey: string, // "yyyy-mm-dd"
  arrivalWindow: ArrivalWindowId,
  estimatedDurationMinutes: number,
  timezone: string,
): Date {
  const [year, month, day] = serviceDateKey.split("-").map(Number);
  const start = ARRIVAL_WINDOW_START_TIME[arrivalWindow];

  const totalMinutesFromStart = estimatedDurationMinutes + CHARGE_DELAY_AFTER_END_MINUTES;
  const startUtc = zonedWallTimeToUtc(year, month, day, start.hour, start.minute, timezone);

  return new Date(startUtc.getTime() + totalMinutesFromStart * 60_000);
}

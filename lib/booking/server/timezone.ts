// SERVER-ONLY. The one DST-safe wall-clock-in-a-timezone -> UTC-instant
// conversion this codebase needs, extracted from scheduledCharge.ts
// (Milestone 5) so Milestone 6's cancellation/reschedule timing logic
// reuses the exact same proven implementation instead of a second copy.
// There is no built-in JS API for this direction (Intl.DateTimeFormat
// only converts UTC -> zoned, not zoned -> UTC).
import "server-only";

/**
 * Converts a wall-clock date/time in a given IANA timezone to the
 * corresponding UTC instant, correctly across DST transitions. Uses the
 * standard two-pass convergence technique: guess assuming the wall time
 * was UTC, see what that guess actually displays as in the target zone,
 * and correct by the difference. A second pass handles the rare case
 * where the correction itself crosses a DST boundary.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
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

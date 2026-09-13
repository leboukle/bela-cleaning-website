// SERVER-ONLY. Computes the authoritative automatic-charge timestamp:
//
//   Scheduled Charge At = service start + estimated duration + 1 hour
//
// Always computed server-side (never trust a browser-computed value) and
// always in the business's configured timezone (Settings.timezone,
// currently America/New_York) — the milestone's own example: an 8:00 AM
// start with a 4-hour estimated duration schedules the charge for 1:00 PM
// *local* time, correctly shifted across DST transitions because the
// wall-clock-to-UTC conversion below re-derives the real UTC offset for
// the specific calendar date in question, rather than assuming a fixed
// offset. "Service start" itself is resolved by the caller — either the
// Milestone 6 amendment's exact Service Start Time or, for legacy
// bookings, the Arrival Window lookup — via serviceTime.ts's
// resolveRecordStartSpec/arrivalWindowStartSpec; this function only knows
// how to add duration + delay to an already-resolved start, and is also
// the one absolute-timestamp value the Apps Script reminder scheduler
// reuses (via pure arithmetic) to derive service start without needing
// its own DST-aware conversion — see reminderService.ts.
import "server-only";
import { calculateServiceStart, type ServiceStartSpec } from "./serviceTime";

export const CHARGE_DELAY_AFTER_END_MINUTES = 60;

export function calculateScheduledChargeAt(
  serviceDateKey: string, // "yyyy-mm-dd"
  startSpec: ServiceStartSpec,
  estimatedDurationMinutes: number,
  timezone: string,
): Date {
  const totalMinutesFromStart = estimatedDurationMinutes + CHARGE_DELAY_AFTER_END_MINUTES;
  const startUtc = calculateServiceStart(serviceDateKey, startSpec, timezone);

  return new Date(startUtc.getTime() + totalMinutesFromStart * 60_000);
}

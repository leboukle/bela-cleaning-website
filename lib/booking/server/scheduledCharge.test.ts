import { describe, it, expect } from "vitest";
import { calculateScheduledChargeAt } from "./scheduledCharge";

const TZ = "America/New_York";

describe("calculateScheduledChargeAt", () => {
  it("computes start + duration + 1 hour for a morning window in EST (winter, UTC-5)", () => {
    // Morning window starts 8:00 AM local. 4-hour duration -> ends 12:00 PM,
    // + 1 hour -> 1:00 PM EST = 18:00 UTC.
    const result = calculateScheduledChargeAt("2026-01-15", "morning", 240, TZ);
    expect(result.toISOString()).toBe("2026-01-15T18:00:00.000Z");
  });

  it("computes start + duration + 1 hour for an afternoon window in EDT (summer, UTC-4)", () => {
    // Afternoon window starts 2:00 PM local. 3-hour duration -> ends 5:00 PM,
    // + 1 hour -> 6:00 PM EDT = 22:00 UTC.
    const result = calculateScheduledChargeAt("2026-07-15", "afternoon", 180, TZ);
    expect(result.toISOString()).toBe("2026-07-15T22:00:00.000Z");
  });

  it("uses the correct UTC offset on the day DST springs forward (2026-03-08)", () => {
    // Midday window starts 10:00 AM local, already past the 2:00 AM
    // spring-forward transition, so this day is fully EDT (UTC-4).
    // 10:00 + 2h duration -> 12:00, +1h -> 1:00 PM EDT = 17:00 UTC.
    const result = calculateScheduledChargeAt("2026-03-08", "midday", 120, TZ);
    expect(result.toISOString()).toBe("2026-03-08T17:00:00.000Z");
  });

  it("uses the correct UTC offset on the day DST falls back (2026-11-01)", () => {
    // Early-afternoon window starts 12:00 PM local, already past the 2:00
    // AM fall-back transition, so this day is fully EST (UTC-5).
    // 12:00 + 90min duration -> 1:30 PM, +1h -> 2:30 PM EST = 19:30 UTC.
    const result = calculateScheduledChargeAt("2026-11-01", "early-afternoon", 90, TZ);
    expect(result.toISOString()).toBe("2026-11-01T19:30:00.000Z");
  });

  it("maps each arrival window to its documented start time", () => {
    const morning = calculateScheduledChargeAt("2026-06-01", "morning", 0, TZ);
    const midday = calculateScheduledChargeAt("2026-06-01", "midday", 0, TZ);
    const earlyAfternoon = calculateScheduledChargeAt("2026-06-01", "early-afternoon", 0, TZ);
    const afternoon = calculateScheduledChargeAt("2026-06-01", "afternoon", 0, TZ);
    // Each is exactly 2 hours after the previous (matching schedule.ts's
    // ARRIVAL_WINDOWS labels: 8-10, 10-12, 12-2, 2-4), plus the fixed +1h delay.
    expect(midday.getTime() - morning.getTime()).toBe(2 * 60 * 60 * 1000);
    expect(earlyAfternoon.getTime() - midday.getTime()).toBe(2 * 60 * 60 * 1000);
    expect(afternoon.getTime() - earlyAfternoon.getTime()).toBe(2 * 60 * 60 * 1000);
  });
});

import { describe, it, expect } from "vitest";
import { getBookingTimingStatus, calculateLateCancellationFeeCents, CancellationPolicyError } from "./cancellationPolicy";

const TZ = "America/New_York";

describe("getBookingTimingStatus — 24-hour boundary", () => {
  // Morning window on a plain (non-DST-transition) date: 8:00 AM EDT = 12:00 UTC.
  const SCHEDULED_START_ISO = "2026-06-01T12:00:00.000Z";

  it("24 hours + 1 minute out is free (isMoreThan24HoursOut = true)", () => {
    const now = new Date(new Date(SCHEDULED_START_ISO).getTime() - (24 * 60 + 1) * 60_000);
    const status = getBookingTimingStatus("2026-06-01", "", "Morning", TZ, now);
    expect(status.isMoreThan24HoursOut).toBe(true);
  });

  it("exactly 24 hours out is late (isMoreThan24HoursOut = false) — inclusive boundary", () => {
    const now = new Date(new Date(SCHEDULED_START_ISO).getTime() - 24 * 60 * 60_000);
    const status = getBookingTimingStatus("2026-06-01", "", "Morning", TZ, now);
    expect(status.millisecondsUntilStart).toBe(24 * 60 * 60_000);
    expect(status.isMoreThan24HoursOut).toBe(false);
  });

  it("23 hours 59 minutes out is late", () => {
    const now = new Date(new Date(SCHEDULED_START_ISO).getTime() - (23 * 60 + 59) * 60_000);
    const status = getBookingTimingStatus("2026-06-01", "", "Morning", TZ, now);
    expect(status.isMoreThan24HoursOut).toBe(false);
  });

  it("a booking already in the past is late", () => {
    const now = new Date(new Date(SCHEDULED_START_ISO).getTime() + 60_000);
    const status = getBookingTimingStatus("2026-06-01", "", "Morning", TZ, now);
    expect(status.millisecondsUntilStart).toBeLessThan(0);
    expect(status.isMoreThan24HoursOut).toBe(false);
  });

  it("throws CancellationPolicyError for an unrecognized arrival window label", () => {
    expect(() => getBookingTimingStatus("2026-06-01", "", "Not A Real Window", TZ)).toThrow(CancellationPolicyError);
  });

  it("prefers the exact Service Start Time over Arrival Window when both are somehow present", () => {
    // 13:00 local -> different instant than the Morning-window fixture above.
    const now = new Date(new Date(SCHEDULED_START_ISO).getTime() - (24 * 60 + 1) * 60_000);
    const exact = getBookingTimingStatus("2026-06-01", "13:00", "Morning", TZ, now);
    expect(exact.scheduledStart.toISOString()).not.toBe(SCHEDULED_START_ISO);
  });

  it("resolves a blank Service Start Time via the legacy Arrival Window label (backward compatibility)", () => {
    const now = new Date(new Date(SCHEDULED_START_ISO).getTime() - (24 * 60 + 1) * 60_000);
    const legacy = getBookingTimingStatus("2026-06-01", "", "Morning", TZ, now);
    expect(legacy.scheduledStart.toISOString()).toBe(SCHEDULED_START_ISO);
  });
});

describe("getBookingTimingStatus — DST transitions", () => {
  it("computes the boundary correctly for a booking scheduled on the spring-forward day (2026-03-08, midday = 10:00 AM EDT = 14:00 UTC)", () => {
    const scheduledStartMs = new Date("2026-03-08T14:00:00.000Z").getTime();

    const justOver = getBookingTimingStatus("2026-03-08", "", "Midday", TZ, new Date(scheduledStartMs - (24 * 60 + 1) * 60_000));
    expect(justOver.isMoreThan24HoursOut).toBe(true);

    const exactly24h = getBookingTimingStatus("2026-03-08", "", "Midday", TZ, new Date(scheduledStartMs - 24 * 60 * 60_000));
    expect(exactly24h.isMoreThan24HoursOut).toBe(false);
  });

  it("computes the boundary correctly for a booking scheduled on the fall-back day (2026-11-01, early afternoon = 12:00 PM EST = 17:00 UTC)", () => {
    const scheduledStartMs = new Date("2026-11-01T17:00:00.000Z").getTime();

    const justOver = getBookingTimingStatus("2026-11-01", "", "Early Afternoon", TZ, new Date(scheduledStartMs - (24 * 60 + 1) * 60_000));
    expect(justOver.isMoreThan24HoursOut).toBe(true);

    const exactly24h = getBookingTimingStatus("2026-11-01", "", "Early Afternoon", TZ, new Date(scheduledStartMs - 24 * 60 * 60_000));
    expect(exactly24h.isMoreThan24HoursOut).toBe(false);
  });
});

describe("calculateLateCancellationFeeCents", () => {
  it("is exactly 50% of the authoritative charge amount, in cents", () => {
    expect(calculateLateCancellationFeeCents(190.5)).toBe(9525);
    expect(calculateLateCancellationFeeCents(200)).toBe(10000);
  });

  it("rounds to the nearest cent", () => {
    expect(calculateLateCancellationFeeCents(99.99)).toBe(5000); // 4999.5 rounds up
    expect(calculateLateCancellationFeeCents(0.03)).toBe(2); // 1.5 rounds up
  });
});

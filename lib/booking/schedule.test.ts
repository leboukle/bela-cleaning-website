import { describe, it, expect } from "vitest";
import { getMinSelectableDate, isArrivalWindowSelectable, isDateSelectable, toDateKey } from "./schedule";

describe("getMinSelectableDate — 24-hour minimum lead time", () => {
  it("returns tomorrow when now is well before today's latest (2:00 PM) window", () => {
    const now = new Date(2026, 5, 14, 10, 0, 0); // June 14, 10:00 AM
    expect(toDateKey(getMinSelectableDate(now))).toBe("2026-06-15");
  });

  it("returns tomorrow when tomorrow's 2:00 PM window is exactly 24 hours away", () => {
    const now = new Date(2026, 5, 14, 14, 0, 0); // June 14, 2:00 PM
    expect(toDateKey(getMinSelectableDate(now))).toBe("2026-06-15");
  });

  it("skips to the day after tomorrow once tomorrow's 2:00 PM window is less than 24 hours away", () => {
    const now = new Date(2026, 5, 14, 14, 0, 1); // one second past 2:00 PM
    expect(toDateKey(getMinSelectableDate(now))).toBe("2026-06-16");
  });

  it("never returns today, regardless of the time of day", () => {
    const now = new Date(2026, 5, 14, 0, 0, 1); // just after midnight
    expect(toDateKey(getMinSelectableDate(now))).not.toBe("2026-06-14");
  });
});

describe("isDateSelectable — consistent with the 24-hour minimum lead time", () => {
  it("rejects today even at the very start of the day", () => {
    const now = new Date(2026, 5, 14, 0, 0, 1);
    expect(isDateSelectable(new Date(2026, 5, 14), { today: now })).toBe(false);
  });

  it("accepts the earliest qualifying date returned by getMinSelectableDate", () => {
    const now = new Date(2026, 5, 14, 10, 0, 0);
    const min = getMinSelectableDate(now);
    expect(isDateSelectable(min, { today: now })).toBe(true);
  });
});

describe("isArrivalWindowSelectable — per-window 24-hour minimum lead time", () => {
  it("accepts the afternoon window exactly at the 24-hour boundary", () => {
    const now = new Date(2026, 5, 14, 14, 0, 0);
    expect(isArrivalWindowSelectable("2026-06-15", "afternoon", now)).toBe(true);
  });

  it("rejects an earlier same-day window that is less than 24 hours away", () => {
    const now = new Date(2026, 5, 14, 14, 0, 0);
    expect(isArrivalWindowSelectable("2026-06-15", "morning", now)).toBe(false);
  });

  it("accepts every window on a date safely beyond the boundary", () => {
    const now = new Date(2026, 5, 14, 14, 0, 0);
    expect(isArrivalWindowSelectable("2026-06-16", "morning", now)).toBe(true);
    expect(isArrivalWindowSelectable("2026-06-16", "afternoon", now)).toBe(true);
  });
});

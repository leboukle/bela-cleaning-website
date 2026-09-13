import { describe, it, expect } from "vitest";
import { getMinSelectableDate, isDateSelectable, toDateKey, OPERATING_LATEST_START_HOUR } from "./schedule";

describe("getMinSelectableDate — 24-hour minimum lead time (exact-time model)", () => {
  it("returns tomorrow when now is well before today's latest (4:00 PM) offered start", () => {
    const now = new Date(2026, 5, 14, 10, 0, 0); // June 14, 10:00 AM
    expect(toDateKey(getMinSelectableDate(now))).toBe("2026-06-15");
  });

  it("returns tomorrow when tomorrow's 4:00 PM start is exactly 24 hours away", () => {
    const now = new Date(2026, 5, 14, OPERATING_LATEST_START_HOUR, 0, 0); // June 14, 4:00 PM
    expect(toDateKey(getMinSelectableDate(now))).toBe("2026-06-15");
  });

  it("skips to the day after tomorrow once tomorrow's 4:00 PM start is less than 24 hours away", () => {
    const now = new Date(2026, 5, 14, OPERATING_LATEST_START_HOUR, 0, 1); // one second past 4:00 PM
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

import { describe, it, expect } from "vitest";
import { getMinSelectableDate, isDateSelectable, toDateKey, OPERATING_LATEST_START_HOUR } from "./schedule";

describe("getMinSelectableDate — 120-hour minimum lead time (exact-time model)", () => {
  it("returns 5 days out when now is well before that day's latest (4:00 PM) offered start", () => {
    const now = new Date(2026, 5, 14, 10, 0, 0); // June 14, 10:00 AM
    expect(toDateKey(getMinSelectableDate(now))).toBe("2026-06-19");
  });

  it("returns 5 days out when that day's 4:00 PM start is exactly 120 hours away", () => {
    const now = new Date(2026, 5, 14, OPERATING_LATEST_START_HOUR, 0, 0); // June 14, 4:00 PM
    expect(toDateKey(getMinSelectableDate(now))).toBe("2026-06-19");
  });

  it("skips to 6 days out once 5-days-out's 4:00 PM start is less than 120 hours away", () => {
    const now = new Date(2026, 5, 14, OPERATING_LATEST_START_HOUR, 0, 1); // one second past 4:00 PM
    expect(toDateKey(getMinSelectableDate(now))).toBe("2026-06-20");
  });

  it("never returns today, regardless of the time of day", () => {
    const now = new Date(2026, 5, 14, 0, 0, 1); // just after midnight
    expect(toDateKey(getMinSelectableDate(now))).not.toBe("2026-06-14");
  });
});

describe("isDateSelectable — consistent with the 120-hour minimum lead time", () => {
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

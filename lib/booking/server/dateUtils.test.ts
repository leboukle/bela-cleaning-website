import { describe, it, expect } from "vitest";
import { isValidDateKey, isPastOrWithinLeadWindow, getTodayDateKeyInTimezone } from "./dateUtils";

describe("isValidDateKey", () => {
  it("accepts a well-formed real calendar date", () => {
    expect(isValidDateKey("2026-09-15")).toBe(true);
  });

  it("rejects malformed strings", () => {
    expect(isValidDateKey("09-15-2026")).toBe(false);
    expect(isValidDateKey("2026/09/15")).toBe(false);
    expect(isValidDateKey("")).toBe(false);
  });

  it("rejects an impossible calendar date", () => {
    expect(isValidDateKey("2026-02-30")).toBe(false);
  });
});

describe("getTodayDateKeyInTimezone", () => {
  it("returns a yyyy-mm-dd formatted string", () => {
    expect(getTodayDateKeyInTimezone("America/New_York")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("isPastOrWithinLeadWindow", () => {
  it("is true for today, which always falls inside any positive lead window", () => {
    const today = getTodayDateKeyInTimezone("America/New_York");
    expect(isPastOrWithinLeadWindow(today, "America/New_York", 7)).toBe(true);
  });

  it("is false for a date safely beyond the minimum lead window", () => {
    const [y, m, d] = getTodayDateKeyInTimezone("America/New_York").split("-").map(Number);
    const future = new Date(Date.UTC(y, m - 1, d));
    future.setUTCDate(future.getUTCDate() + 30);
    const futureKey = `${future.getUTCFullYear()}-${String(future.getUTCMonth() + 1).padStart(2, "0")}-${String(future.getUTCDate()).padStart(2, "0")}`;
    expect(isPastOrWithinLeadWindow(futureKey, "America/New_York", 7)).toBe(false);
  });
});

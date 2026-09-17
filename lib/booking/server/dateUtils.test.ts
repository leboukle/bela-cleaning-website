import { describe, it, expect } from "vitest";
import {
  isValidDateKey,
  isPastOrWithinLeadWindow,
  getTodayDateKeyInTimezone,
  isLessThanMinimumLeadTime,
  formatOperationalTimestamp,
} from "./dateUtils";

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

describe("isLessThanMinimumLeadTime", () => {
  it("is true for a service start under 120 hours from now", () => {
    const now = new Date("2026-06-14T12:00:00Z");
    const serviceStart = new Date(now.getTime() + 119 * 60 * 60 * 1000);
    expect(isLessThanMinimumLeadTime(serviceStart, now)).toBe(true);
  });

  it("is true at 119 hours 59 minutes from now (one minute short of the boundary)", () => {
    const now = new Date("2026-06-14T12:00:00Z");
    const serviceStart = new Date(now.getTime() + (119 * 60 + 59) * 60 * 1000);
    expect(isLessThanMinimumLeadTime(serviceStart, now)).toBe(true);
  });

  it("is false at exactly the 120-hour boundary (inclusive-eligible)", () => {
    const now = new Date("2026-06-14T12:00:00Z");
    const serviceStart = new Date(now.getTime() + 120 * 60 * 60 * 1000);
    expect(isLessThanMinimumLeadTime(serviceStart, now)).toBe(false);
  });

  it("is false for a service start safely beyond 120 hours", () => {
    const now = new Date("2026-06-14T12:00:00Z");
    const serviceStart = new Date(now.getTime() + 144 * 60 * 60 * 1000); // 6 days
    expect(isLessThanMinimumLeadTime(serviceStart, now)).toBe(false);
  });
});

describe("formatOperationalTimestamp", () => {
  it("formats a UTC instant as America/New_York local time during EDT (summer)", () => {
    const result = formatOperationalTimestamp(new Date("2026-06-14T16:00:00.000Z")); // noon EDT
    expect(result).toContain("06/14/2026");
    expect(result).toContain("12:00:00 PM");
    expect(result).toContain("EDT");
  });

  it("formats a UTC instant as America/New_York local time during EST (winter)", () => {
    const result = formatOperationalTimestamp(new Date("2026-01-15T18:00:00.000Z")); // 1:00 PM EST
    expect(result).toContain("01/15/2026");
    expect(result).toContain("1:00:00 PM");
    expect(result).toContain("EST");
  });

  it("resolves EST vs. EDT automatically across the spring-forward transition (2026-03-08)", () => {
    const beforeTransition = formatOperationalTimestamp(new Date("2026-03-08T06:59:00.000Z")); // 1:59 AM EST
    const afterTransition = formatOperationalTimestamp(new Date("2026-03-08T07:01:00.000Z")); // 3:01 AM EDT
    expect(beforeTransition).toContain("EST");
    expect(afterTransition).toContain("EDT");
  });

  it("resolves EST vs. EDT automatically across the fall-back transition (2026-11-01)", () => {
    const beforeTransition = formatOperationalTimestamp(new Date("2026-11-01T05:59:00.000Z")); // 1:59 AM EDT
    const afterTransition = formatOperationalTimestamp(new Date("2026-11-01T07:01:00.000Z")); // 2:01 AM EST
    expect(beforeTransition).toContain("EDT");
    expect(afterTransition).toContain("EST");
  });

  it("returns a human-readable string, never a raw ISO/UTC string", () => {
    const result = formatOperationalTimestamp(new Date("2026-06-14T16:00:00.000Z"));
    expect(result).not.toMatch(/Z$/);
    expect(result).not.toMatch(/^\d{4}-\d{2}-\d{2}T/); // not the ISO 8601 shape
  });
});

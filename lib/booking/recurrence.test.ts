import { describe, it, expect } from "vitest";
import { addDaysToDateKey, getFrequencyIdForLabel, getOccurrenceDateKey, isRecurringCadence } from "./recurrence";
import { calculateServiceStart } from "./server/serviceTime";

const series = (anchor: string, cadence: string, count: number) =>
  Array.from({ length: count }, (_, i) => getOccurrenceDateKey(anchor, cadence, i + 1));

describe("getOccurrenceDateKey — weekly and biweekly", () => {
  it("occurrence 1 is the anchor itself", () => {
    expect(getOccurrenceDateKey("2026-11-02", "weekly", 1)).toBe("2026-11-02");
    expect(getOccurrenceDateKey("2026-11-02", "monthly", 1)).toBe("2026-11-02");
  });

  it("weekly is every 7 days, across month and year boundaries", () => {
    expect(series("2026-12-14", "weekly", 5)).toEqual(["2026-12-14", "2026-12-21", "2026-12-28", "2027-01-04", "2027-01-11"]);
  });

  it("biweekly is every 14 days", () => {
    expect(series("2026-02-16", "biweekly", 4)).toEqual(["2026-02-16", "2026-03-02", "2026-03-16", "2026-03-30"]);
  });

  it("handles a leap-day boundary", () => {
    expect(series("2028-02-22", "weekly", 3)).toEqual(["2028-02-22", "2028-02-29", "2028-03-07"]);
  });
});

describe("getOccurrenceDateKey — monthly (same numbered date)", () => {
  it("keeps the same day of month", () => {
    expect(series("2026-11-15", "monthly", 4)).toEqual(["2026-11-15", "2026-12-15", "2027-01-15", "2027-02-15"]);
  });

  it("clamps a 31st anchor to the last day of shorter months, then returns to the 31st", () => {
    expect(series("2027-01-31", "monthly", 7)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
      "2027-06-30",
      "2027-07-31",
    ]);
  });

  it("clamps a 30th anchor only in February", () => {
    expect(series("2027-01-30", "monthly", 4)).toEqual(["2027-01-30", "2027-02-28", "2027-03-30", "2027-04-30"]);
  });

  it("clamps a 29th anchor in a non-leap February and uses Feb 29 in a leap year", () => {
    expect(getOccurrenceDateKey("2027-01-29", "monthly", 2)).toBe("2027-02-28");
    expect(getOccurrenceDateKey("2028-01-29", "monthly", 2)).toBe("2028-02-29");
    expect(getOccurrenceDateKey("2028-01-29", "monthly", 3)).toBe("2028-03-29");
  });

  it("is computed from the ANCHOR, so one short month never drags later months earlier", () => {
    // Occurrence 3 of a Jan 31 anchor is Mar 31 — not Feb 28's day-of-month + 1 month (Mar 28).
    expect(getOccurrenceDateKey("2027-01-31", "monthly", 3)).toBe("2027-03-31");
    expect(getOccurrenceDateKey("2027-01-31", "monthly", 13)).toBe("2028-01-31");
  });

  it("rolls over years", () => {
    expect(getOccurrenceDateKey("2026-12-31", "monthly", 2)).toBe("2027-01-31");
    expect(getOccurrenceDateKey("2026-11-30", "monthly", 4)).toBe("2027-02-28");
  });
});

describe("validation", () => {
  it("rejects invalid occurrence numbers and non-recurring cadences", () => {
    expect(() => getOccurrenceDateKey("2026-11-02", "weekly", 0)).toThrow();
    expect(() => getOccurrenceDateKey("2026-11-02", "weekly", 1.5)).toThrow();
    expect(() => getOccurrenceDateKey("2026-11-02", "one-time", 2)).toThrow();
    expect(() => getOccurrenceDateKey("not-a-date", "weekly", 2)).toThrow();
  });

  it("maps persisted labels back to cadence ids", () => {
    expect(getFrequencyIdForLabel("Weekly")).toBe("weekly");
    expect(getFrequencyIdForLabel("Every other week")).toBe("biweekly");
    expect(getFrequencyIdForLabel("Monthly")).toBe("monthly");
    expect(getFrequencyIdForLabel("One time")).toBe("one-time");
    expect(getFrequencyIdForLabel("Daily")).toBeNull();
    expect(isRecurringCadence("weekly")).toBe(true);
    expect(isRecurringCadence("one-time")).toBe(false);
  });

  it("addDaysToDateKey crosses months and years", () => {
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateKey("2027-03-01", -1)).toBe("2027-02-28");
  });
});

describe("local time across DST (America/New_York)", () => {
  const TZ = "America/New_York";
  const localHour = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(date);

  it("a 9:00 AM weekly visit stays at 9:00 AM local every week through spring-forward and fall-back", () => {
    const dates = [
      ...series("2027-02-22", "weekly", 8), // spring forward Sun 2027-03-14
      ...series("2027-10-25", "weekly", 8), // fall back Sun 2027-11-07
    ];
    for (const date of dates) {
      expect(localHour(calculateServiceStart(date, { hour: 9, minute: 0 }, TZ))).toBe("09");
    }
    // …even though the UTC instant shifts by an hour.
    expect(calculateServiceStart("2027-03-08", { hour: 9, minute: 0 }, TZ).toISOString()).toBe("2027-03-08T14:00:00.000Z");
    expect(calculateServiceStart("2027-03-15", { hour: 9, minute: 0 }, TZ).toISOString()).toBe("2027-03-15T13:00:00.000Z");
  });
});

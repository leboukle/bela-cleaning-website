import { describe, it, expect } from "vitest";
import { getClosedDateKeysInWindow, isServiceDateClosed, DATE_UNAVAILABLE_MESSAGE } from "./serviceClosures";
import { isDateSelectable } from "./schedule";

describe("service closure (2026-10-22 through 2026-12-31, inclusive)", () => {
  it("closes both boundary dates and everything between", () => {
    for (const key of ["2026-10-22", "2026-10-23", "2026-11-15", "2026-12-24", "2026-12-31"]) {
      expect(isServiceDateClosed(key), key).toBe(true);
    }
  });

  it("does not close the day before or the day after", () => {
    expect(isServiceDateClosed("2026-10-21")).toBe(false);
    expect(isServiceDateClosed("2027-01-01")).toBe(false);
    expect(isServiceDateClosed("2027-01-02")).toBe(false);
    expect(isServiceDateClosed("2027-10-25")).toBe(false); // same month/day, different year
  });

  it("never treats a malformed key as closed", () => {
    expect(isServiceDateClosed("")).toBe(false);
    expect(isServiceDateClosed("10/22/2026")).toBe(false);
  });

  it("lists every closed date in a window, clipped to the window", () => {
    const all = getClosedDateKeysInWindow("2026-01-01", "2027-06-30");
    expect(all).toHaveLength(71); // Oct 22-31 (10) + Nov (30) + Dec (31)
    expect(all[0]).toBe("2026-10-22");
    expect(all[all.length - 1]).toBe("2026-12-31");
    expect(getClosedDateKeysInWindow("2026-12-30", "2027-02-01")).toEqual(["2026-12-30", "2026-12-31"]);
    expect(getClosedDateKeysInWindow("2027-01-01", "2027-02-01")).toEqual([]);
  });

  it("uses neutral wording that never claims the business is closed", () => {
    expect(DATE_UNAVAILABLE_MESSAGE).toBe("This date is unavailable. Please choose another date.");
    expect(DATE_UNAVAILABLE_MESSAGE).not.toMatch(/closed|not accepting|2026|temporar/i);
  });

  it("the shared calendar rule disables closed dates even when the availability API returned nothing", () => {
    const today = new Date(2026, 9, 22);
    expect(isDateSelectable(new Date(2026, 10, 15), { today, unavailableDateKeys: [] })).toBe(false);
    expect(isDateSelectable(new Date(2026, 11, 31), { today, unavailableDateKeys: [] })).toBe(false);
    expect(isDateSelectable(new Date(2027, 0, 5), { today, unavailableDateKeys: [] })).toBe(true);
    expect(isDateSelectable(new Date(2027, 0, 5), { today, unavailableDateKeys: ["2027-01-05"] })).toBe(false);
  });
});

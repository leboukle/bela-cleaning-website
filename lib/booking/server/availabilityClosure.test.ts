import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./sheetsClient", () => ({ getRange: vi.fn(), batchGetRanges: vi.fn() }));
vi.mock("./settings", () => ({ getBookingSettings: vi.fn() }));

import { getRange, batchGetRanges } from "./sheetsClient";
import { getBookingSettings } from "./settings";
import {
  checkDateAvailability,
  checkExactTimeAvailability,
  getActiveBlackoutDateSet,
  getAvailableStartTimes,
  getUnavailableDateKeysInWindow,
  normalizeDateCell,
} from "./availability";

const mockedGetRange = vi.mocked(getRange);
const mockedBatchGetRanges = vi.mocked(batchGetRanges);
const SETTINGS = { minimumLeadDays: 7, defaultDailyCapacity: 2, timezone: "America/New_York", schemaVersion: 1 };

// Well before every date below, so the 120-hour rule never decides these.
const NOW = new Date("2026-10-22T12:00:00-04:00");

function sheet(blackout: string[][] = []) {
  mockedGetRange.mockImplementation(async (range: string) => (range.startsWith("Blackout Dates") ? blackout : []));
  mockedBatchGetRanges.mockImplementation(async (ranges: string[]) => ranges.map(() => []));
}

beforeEach(() => {
  mockedGetRange.mockReset();
  mockedBatchGetRanges.mockReset();
  vi.mocked(getBookingSettings).mockReset().mockResolvedValue(SETTINGS);
});

describe("closure enforced by the existing availability functions (no Sheet rows needed)", () => {
  it("calendar window lists every closed date, and only those, with an empty Blackout Dates tab", async () => {
    sheet();
    const keys = await getUnavailableDateKeysInWindow("2026-10-22", "2027-02-28");
    expect(keys).toHaveLength(71);
    expect(keys).toContain("2026-10-22");
    expect(keys).toContain("2026-12-31");
    expect(keys).not.toContain("2027-01-01");
  });

  it("single-date check is closed for the boundaries and any date between", async () => {
    sheet();
    for (const key of ["2026-10-22", "2026-11-26", "2026-12-31"]) {
      const result = await checkDateAvailability(key);
      expect(result).toMatchObject({ available: false, reason: "closed" });
    }
  });

  it("exact-time check (booking submission, rescheduling, recurring generation) rejects closed dates at every hour", async () => {
    sheet();
    for (const date of ["2026-10-22", "2026-10-27", "2026-12-31"]) {
      for (const time of ["09:00", "13:00", "16:00"]) {
        const result = await checkExactTimeAvailability(date, time, 120, NOW);
        expect(result, `${date} ${time}`).toMatchObject({ available: false, reason: "closed" });
      }
    }
  });

  it("offers no start times on a closed date", async () => {
    sheet();
    expect(await getAvailableStartTimes("2026-11-30", 120, NOW)).toEqual([]);
  });

  it("does not reopen anything on 2027-01-01 onward: normal availability still applies", async () => {
    sheet([["2027-01-05", "Closed", "TRUE"]]);
    expect((await checkDateAvailability("2027-01-01")).available).toBe(true);
    expect((await checkExactTimeAvailability("2027-01-01", "09:00", 120, NOW)).available).toBe(true);
    expect((await getAvailableStartTimes("2027-01-01", 120, NOW)).length).toBeGreaterThan(0);
    // existing blackout still blocks
    expect(await checkExactTimeAvailability("2027-01-05", "09:00", 120, NOW)).toMatchObject({ available: false, reason: "blackout" });
    // existing 120-hour lead time still blocks
    const soon = new Date("2026-12-30T12:00:00-05:00");
    expect(await checkExactTimeAvailability("2027-01-01", "09:00", 120, soon)).toMatchObject({ available: false, reason: "too-soon" });
  });
});

describe("Blackout Dates rows are read the way Sheets displays them", () => {
  it.each([
    ["2026-10-22", "2026-10-22"],
    ["10/22/2026", "2026-10-22"],
    ["1/5/2027", "2027-01-05"],
    ["2026/10/22", "2026-10-22"],
    ["Oct 22, 2026", "2026-10-22"],
    ["October 22, 2026", "2026-10-22"],
    ["Thu, Oct 22, 2026", "2026-10-22"],
    ["46317", "2026-10-22"],
    ["  2026-10-22 ", "2026-10-22"],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizeDateCell(raw)).toBe(expected);
  });

  it("does not turn an impossible date into a different one", () => {
    expect(normalizeDateCell("2/30/2027")).toBe("2/30/2027");
  });

  it("applies an active blackout typed as a US date, with a checkbox TRUE", async () => {
    sheet([["2/10/2027", "Holiday", "TRUE"]]);
    expect((await getActiveBlackoutDateSet()).has("2027-02-10")).toBe(true);
    expect(await checkExactTimeAvailability("2027-02-10", "09:00", 120, NOW)).toMatchObject({ reason: "blackout" });
  });

  it("ignores inactive rows and blank Active", async () => {
    sheet([
      ["2/11/2027", "x", "FALSE"],
      ["2/12/2027", "x", ""],
    ]);
    expect((await getActiveBlackoutDateSet()).size).toBe(0);
  });

  it("reports (without dates) an active row whose Date cannot be read", async () => {
    sheet([["sometime in March", "x", "TRUE"]]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await getActiveBlackoutDateSet()).size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain("March");
    warn.mockRestore();
  });
});

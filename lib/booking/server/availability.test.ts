import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./sheetsClient", () => ({
  getRange: vi.fn(),
  batchGetRanges: vi.fn(),
}));
vi.mock("./settings", () => ({
  getBookingSettings: vi.fn(),
}));

import { getRange, batchGetRanges } from "./sheetsClient";
import { getBookingSettings } from "./settings";
import { checkDateAvailability, getUnavailableDateKeysInWindow } from "./availability";

const mockedGetRange = vi.mocked(getRange);
const mockedBatchGetRanges = vi.mocked(batchGetRanges);
const mockedGetBookingSettings = vi.mocked(getBookingSettings);

const SETTINGS = { minimumLeadDays: 7, defaultDailyCapacity: 2, timezone: "America/New_York", schemaVersion: 1 };

beforeEach(() => {
  mockedGetRange.mockReset();
  mockedBatchGetRanges.mockReset();
  mockedGetBookingSettings.mockReset().mockResolvedValue(SETTINGS);
});

function setupSheetData(options: {
  blackout?: string[][];
  overrides?: string[][];
  bookingDates?: string[][];
  bookingStatuses?: string[][];
}) {
  mockedGetRange.mockImplementation(async (range: string) => {
    if (range.startsWith("Blackout Dates")) return options.blackout ?? [];
    if (range.startsWith("Availability Overrides")) return options.overrides ?? [];
    return [];
  });
  mockedBatchGetRanges.mockImplementation(async () => [options.bookingDates ?? [], options.bookingStatuses ?? []]);
}

describe("checkDateAvailability", () => {
  it("is unavailable for an active blackout date", async () => {
    setupSheetData({ blackout: [["2026-09-01", "Holiday", "TRUE"]] });
    const result = await checkDateAvailability("2026-09-01");
    expect(result).toEqual({ available: false, reason: "blackout", maxCapacity: 2, currentCount: 0 });
  });

  it("is unavailable when at default capacity", async () => {
    setupSheetData({
      bookingDates: [["2026-09-02"], ["2026-09-02"]],
      bookingStatuses: [["Pending Payment"], ["Pending Payment"]],
    });
    const result = await checkDateAvailability("2026-09-02");
    expect(result.available).toBe(false);
    expect(result.reason).toBe("at-capacity");
    expect(result.currentCount).toBe(2);
  });

  it("excludes cancelled bookings from the capacity count", async () => {
    setupSheetData({
      bookingDates: [["2026-09-03"], ["2026-09-03"]],
      bookingStatuses: [["Cancelled"], ["Pending Payment"]],
    });
    const result = await checkDateAvailability("2026-09-03");
    expect(result.available).toBe(true);
    expect(result.currentCount).toBe(1);
  });

  it("is available under capacity with no blackout", async () => {
    setupSheetData({});
    const result = await checkDateAvailability("2026-09-04");
    expect(result).toEqual({ available: true, reason: null, maxCapacity: 2, currentCount: 0 });
  });

  it("uses an active override's capacity instead of the default", async () => {
    setupSheetData({
      overrides: [["2026-09-05", "5", "Extra staff", "TRUE"]],
      bookingDates: [["2026-09-05"], ["2026-09-05"], ["2026-09-05"]],
      bookingStatuses: [["Pending Payment"], ["Pending Payment"], ["Pending Payment"]],
    });
    const result = await checkDateAvailability("2026-09-05");
    expect(result.maxCapacity).toBe(5);
    expect(result.available).toBe(true);
  });

  it("ignores an inactive override and falls back to default capacity", async () => {
    setupSheetData({ overrides: [["2026-09-06", "10", "Not active", "FALSE"]] });
    const result = await checkDateAvailability("2026-09-06");
    expect(result.maxCapacity).toBe(2);
  });
});

describe("getUnavailableDateKeysInWindow", () => {
  it("includes blackout and at-capacity dates within the window, excludes dates outside it", async () => {
    setupSheetData({
      blackout: [
        ["2026-09-01", "Holiday", "TRUE"],
        ["2026-10-15", "Outside window", "TRUE"],
      ],
      bookingDates: [["2026-09-10"], ["2026-09-10"]],
      bookingStatuses: [["Pending Payment"], ["Pending Payment"]],
    });
    const result = await getUnavailableDateKeysInWindow("2026-09-01", "2026-09-30");
    expect([...result].sort()).toEqual(["2026-09-01", "2026-09-10"]);
  });

  it("includes a zero-capacity override date even with no bookings", async () => {
    setupSheetData({ overrides: [["2026-09-20", "0", "Closed", "TRUE"]] });
    const result = await getUnavailableDateKeysInWindow("2026-09-01", "2026-09-30");
    expect(result).toEqual(["2026-09-20"]);
  });
});

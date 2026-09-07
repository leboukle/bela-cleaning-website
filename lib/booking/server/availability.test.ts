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
import { checkDateAvailability, checkExactTimeAvailability, getAvailableStartTimes, getUnavailableDateKeysInWindow } from "./availability";

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

// Milestone 6 amendment: exact appointment start times must become
// overlap/capacity aware (not the old purely day-count model) — these
// tests exercise checkExactTimeAvailability/getAvailableStartTimes
// directly, reusing the same blackout/override/default-capacity data
// source as the tests above.
type ExistingBookingRow = { serviceDate: string; status?: string; arrivalWindow?: string; serviceStartTime?: string; durationMinutes: number };

function setupExactTimeData(options: { blackout?: string[][]; overrides?: string[][]; bookings?: ExistingBookingRow[] }) {
  const bookings = options.bookings ?? [];
  mockedGetRange.mockImplementation(async (range: string) => {
    if (range.startsWith("Blackout Dates")) return options.blackout ?? [];
    if (range.startsWith("Availability Overrides")) return options.overrides ?? [];
    return [];
  });
  mockedBatchGetRanges.mockImplementation(async () => [
    bookings.map((b) => [b.serviceDate]),
    bookings.map((b) => [b.status ?? "Pending Payment"]),
    bookings.map((b) => [b.arrivalWindow ?? ""]),
    bookings.map((b) => [b.serviceStartTime ?? ""]),
    bookings.map((b) => [String(b.durationMinutes)]),
  ]);
}

describe("checkExactTimeAvailability", () => {
  it("is available for an exact time with no conflicting bookings", async () => {
    setupExactTimeData({});
    const result = await checkExactTimeAvailability("2026-09-10", "09:00", 210);
    expect(result).toEqual({ available: true, reason: null, maxCapacity: 2, peakConcurrentCount: 1 });
  });

  it("is unavailable for a blackout date, without even considering overlap", async () => {
    setupExactTimeData({ blackout: [["2026-09-11", "Holiday", "TRUE"]] });
    const result = await checkExactTimeAvailability("2026-09-11", "09:00", 210);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("blackout");
  });

  it("is unavailable for a start time outside the approved hourly catalog", async () => {
    setupExactTimeData({});
    const result = await checkExactTimeAvailability("2026-09-12", "07:00", 60);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("outside-operating-hours");
  });

  it("is unavailable when the duration would push the cleaning past 8:00 PM close", async () => {
    // A 5-hour cleaning cannot start at 4:00 PM — it would end at 9:00 PM.
    setupExactTimeData({});
    const result = await checkExactTimeAvailability("2026-09-13", "16:00", 300);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("outside-operating-hours");
  });

  it("is unavailable when accepting the candidate would exceed the date's capacity during an overlapping interval", async () => {
    // Default capacity 2. Two existing bookings already overlap 9:00-11:00;
    // a third candidate overlapping the same window would push concurrency to 3.
    setupExactTimeData({
      bookings: [
        { serviceDate: "2026-09-14", serviceStartTime: "09:00", durationMinutes: 120 },
        { serviceDate: "2026-09-14", serviceStartTime: "10:00", durationMinutes: 120 },
      ],
    });
    const result = await checkExactTimeAvailability("2026-09-14", "10:00", 60);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("at-capacity");
  });

  it("is available when existing bookings on the same day don't overlap the candidate interval", async () => {
    setupExactTimeData({
      bookings: [
        { serviceDate: "2026-09-15", serviceStartTime: "08:00", durationMinutes: 120 },
        { serviceDate: "2026-09-15", serviceStartTime: "09:00", durationMinutes: 120 },
      ],
    });
    // Candidate at 14:00 doesn't overlap either 8-10am or 9-11am booking.
    const result = await checkExactTimeAvailability("2026-09-15", "14:00", 120);
    expect(result.available).toBe(true);
  });

  it("excludes cancelled bookings from the overlap count", async () => {
    setupExactTimeData({
      bookings: [
        { serviceDate: "2026-09-16", serviceStartTime: "09:00", durationMinutes: 120, status: "Cancelled" },
        { serviceDate: "2026-09-16", serviceStartTime: "09:00", durationMinutes: 120 },
      ],
    });
    // Only 1 active overlapping booking + the candidate = 2, exactly at the default capacity.
    const result = await checkExactTimeAvailability("2026-09-16", "09:00", 60);
    expect(result.available).toBe(true);
  });

  it("correctly resolves and counts a legacy Arrival Window row toward the overlap", async () => {
    // Morning window = 8:00 AM start. A 3-hour legacy booking runs 8-11am,
    // overlapping a 9:00 AM exact-time candidate.
    setupExactTimeData({
      bookings: [{ serviceDate: "2026-09-17", arrivalWindow: "Morning", durationMinutes: 180 }],
    });
    const result = await checkExactTimeAvailability("2026-09-17", "09:00", 60);
    expect(result.peakConcurrentCount).toBe(2);
  });

  it("respects an active capacity override instead of the default", async () => {
    setupExactTimeData({
      overrides: [["2026-09-18", "5", "Extra staff", "TRUE"]],
      bookings: [
        { serviceDate: "2026-09-18", serviceStartTime: "09:00", durationMinutes: 120 },
        { serviceDate: "2026-09-18", serviceStartTime: "09:00", durationMinutes: 120 },
        { serviceDate: "2026-09-18", serviceStartTime: "09:00", durationMinutes: 120 },
      ],
    });
    const result = await checkExactTimeAvailability("2026-09-18", "09:00", 60);
    expect(result.maxCapacity).toBe(5);
    expect(result.available).toBe(true);
  });
});

describe("getAvailableStartTimes", () => {
  it("returns every hourly candidate whose duration fits before close, when nothing else is booked", async () => {
    setupExactTimeData({});
    const result = await getAvailableStartTimes("2026-09-19", 60);
    expect(result).toEqual(["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]);
  });

  it("excludes start times whose duration would finish after 8:00 PM close", async () => {
    setupExactTimeData({});
    // A 5-hour (300 min) cleaning: 16:00 start would end at 21:00 — excluded.
    // 15:00 start ends at 20:00 exactly — still allowed (finishes AT close).
    const result = await getAvailableStartTimes("2026-09-20", 300);
    expect(result).toContain("15:00");
    expect(result).not.toContain("16:00");
  });

  it("returns an empty list for a blackout date", async () => {
    setupExactTimeData({ blackout: [["2026-09-21", "Holiday", "TRUE"]] });
    const result = await getAvailableStartTimes("2026-09-21", 60);
    expect(result).toEqual([]);
  });

  it("excludes start times that would push concurrency over capacity, while keeping non-overlapping ones", async () => {
    // Default capacity 2. Two existing 2-hour bookings already fill 9-11am;
    // a 60-minute candidate at 9:00, 9:30(n/a, hourly-only)... 10:00 overlaps
    // both and would be the 3rd — excluded. 14:00 doesn't overlap at all.
    setupExactTimeData({
      bookings: [
        { serviceDate: "2026-09-23", serviceStartTime: "09:00", durationMinutes: 120 },
        { serviceDate: "2026-09-23", serviceStartTime: "09:00", durationMinutes: 120 },
      ],
    });
    const result = await getAvailableStartTimes("2026-09-23", 60);
    expect(result).not.toContain("09:00");
    expect(result).not.toContain("10:00");
    expect(result).toContain("14:00");
  });
});

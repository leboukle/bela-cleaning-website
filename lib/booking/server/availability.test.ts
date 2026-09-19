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
import { calculateEstimate } from "@/lib/booking/calculate";
import { initialExtrasState } from "@/lib/booking/types";
import { checkDateAvailability, checkExactTimeAvailability, getAvailableStartTimes, getUnavailableDateKeysInWindow } from "./availability";

const mockedGetRange = vi.mocked(getRange);
const mockedBatchGetRanges = vi.mocked(batchGetRanges);
const mockedGetBookingSettings = vi.mocked(getBookingSettings);

const SETTINGS = { minimumLeadDays: 7, defaultDailyCapacity: 2, timezone: "America/New_York", schemaVersion: 1 };

// Fixed reference "now" safely before every hardcoded fixture date below
// (2026-09-10 through 2026-09-23) — those dates exist only to exercise
// blackout/capacity/operating-hours logic unrelated to the 120-hour
// minimum-lead-time rule, so they're pinned against this fixed clock
// rather than the real one to stay deterministic regardless of when the
// suite actually runs. The 120-hour rule itself has its own dedicated
// describe blocks below, with their own precisely-chosen `now` values.
const FAR_BEFORE_FIXTURES = new Date("2026-01-01T00:00:00-05:00");

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
    const result = await checkExactTimeAvailability("2026-09-10", "09:00", 210, FAR_BEFORE_FIXTURES);
    expect(result).toEqual({ available: true, reason: null, maxCapacity: 2, peakConcurrentCount: 1 });
  });

  it("is unavailable for a blackout date, without even considering overlap", async () => {
    setupExactTimeData({ blackout: [["2026-09-11", "Holiday", "TRUE"]] });
    const result = await checkExactTimeAvailability("2026-09-11", "09:00", 210, FAR_BEFORE_FIXTURES);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("blackout");
  });

  it("is unavailable for a start time outside the approved hourly catalog", async () => {
    setupExactTimeData({});
    const result = await checkExactTimeAvailability("2026-09-12", "07:00", 60, FAR_BEFORE_FIXTURES);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("outside-operating-hours");
  });

  it("no longer accepts an 8:00 AM start for a new booking (earliest start is 9:00 AM)", async () => {
    setupExactTimeData({});
    const result = await checkExactTimeAvailability("2026-09-12", "08:00", 60, FAR_BEFORE_FIXTURES);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("outside-operating-hours");
  });

  it("accepts 9:00 AM when otherwise available", async () => {
    setupExactTimeData({});
    const result = await checkExactTimeAvailability("2026-09-12", "09:00", 60, FAR_BEFORE_FIXTURES);
    expect(result.available).toBe(true);
  });

  it("still counts an EXISTING 8:00 AM booking toward overlap/capacity (existing bookings stay valid and unchanged)", async () => {
    // Two pre-existing 8:00 AM exact-time bookings run 8-10am. A new 9:00 AM
    // candidate overlaps both, pushing concurrency to 3 > default capacity 2.
    setupExactTimeData({
      bookings: [
        { serviceDate: "2026-09-24", serviceStartTime: "08:00", durationMinutes: 120 },
        { serviceDate: "2026-09-24", serviceStartTime: "08:00", durationMinutes: 120 },
      ],
    });
    const result = await checkExactTimeAvailability("2026-09-24", "09:00", 60, FAR_BEFORE_FIXTURES);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("at-capacity");
    expect(result.peakConcurrentCount).toBe(3);
  });

  it("is unavailable when the duration would push the cleaning past 8:00 PM close", async () => {
    // A 5-hour cleaning cannot start at 4:00 PM — it would end at 9:00 PM.
    setupExactTimeData({});
    const result = await checkExactTimeAvailability("2026-09-13", "16:00", 300, FAR_BEFORE_FIXTURES);
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
    const result = await checkExactTimeAvailability("2026-09-14", "10:00", 60, FAR_BEFORE_FIXTURES);
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
    const result = await checkExactTimeAvailability("2026-09-15", "14:00", 120, FAR_BEFORE_FIXTURES);
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
    const result = await checkExactTimeAvailability("2026-09-16", "09:00", 60, FAR_BEFORE_FIXTURES);
    expect(result.available).toBe(true);
  });

  it("correctly resolves and counts a legacy Arrival Window row toward the overlap", async () => {
    // Morning window = 8:00 AM start. A 3-hour legacy booking runs 8-11am,
    // overlapping a 9:00 AM exact-time candidate.
    setupExactTimeData({
      bookings: [{ serviceDate: "2026-09-17", arrivalWindow: "Morning", durationMinutes: 180 }],
    });
    const result = await checkExactTimeAvailability("2026-09-17", "09:00", 60, FAR_BEFORE_FIXTURES);
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
    const result = await checkExactTimeAvailability("2026-09-18", "09:00", 60, FAR_BEFORE_FIXTURES);
    expect(result.maxCapacity).toBe(5);
    expect(result.available).toBe(true);
  });
});

describe("getAvailableStartTimes", () => {
  it("returns every hourly candidate whose duration fits before close, when nothing else is booked", async () => {
    setupExactTimeData({});
    const result = await getAvailableStartTimes("2026-09-19", 60, FAR_BEFORE_FIXTURES);
    expect(result).toEqual(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]);
  });

  it("never offers a start earlier than 9:00 AM, and offers 9:00 AM itself when available", async () => {
    setupExactTimeData({});
    const result = await getAvailableStartTimes("2026-09-19", 60, FAR_BEFORE_FIXTURES);
    expect(result[0]).toBe("09:00");
    expect(result).not.toContain("08:00");
    expect(result.every((time) => time >= "09:00")).toBe(true);
  });

  it("never offers a start whose cleaning would end after 8:00 PM, across a range of durations", async () => {
    setupExactTimeData({});
    for (const duration of [60, 150, 210, 240, 300, 360, 480, 660]) {
      const result = await getAvailableStartTimes("2026-09-19", duration, FAR_BEFORE_FIXTURES);
      for (const time of result) {
        const startMinutes = Number(time.slice(0, 2)) * 60;
        expect(startMinutes).toBeGreaterThanOrEqual(9 * 60);
        expect(startMinutes + duration).toBeLessThanOrEqual(20 * 60);
      }
    }
  });

  it("a longer duration removes later starts that can no longer finish by 8:00 PM, while keeping the 9:00 AM start", async () => {
    setupExactTimeData({});
    // 2 BR + 2 BA Standard, no extras: 150 + 60 = 210 minutes.
    const smallHome = calculateEstimate({
      customEstimateTrigger: null,
      bedrooms: "2",
      bathrooms: "2",
      squareFootage: "up-to-1000",
      cleaningType: "standard",
      extras: { ...initialExtrasState, noExtras: true },
      frequency: "one-time",
    });
    // Same home at 3,001–4,000 sq ft: +90 minutes -> 300 minutes.
    const largeHome = calculateEstimate({
      customEstimateTrigger: null,
      bedrooms: "2",
      bathrooms: "2",
      squareFootage: "3001-4000",
      cleaningType: "standard",
      extras: { ...initialExtrasState, noExtras: true },
      frequency: "one-time",
    });
    expect(smallHome?.totalDurationMinutes).toBe(210);
    expect(largeHome?.totalDurationMinutes).toBe(300);

    const smallTimes = await getAvailableStartTimes("2026-09-19", smallHome!.totalDurationMinutes, FAR_BEFORE_FIXTURES);
    const largeTimes = await getAvailableStartTimes("2026-09-19", largeHome!.totalDurationMinutes, FAR_BEFORE_FIXTURES);

    // 210 min: 16:00 ends 19:30 — allowed. 300 min: 16:00 would end 21:00 — gone; 15:00 ends 20:00 exactly — kept.
    expect(smallTimes).toContain("16:00");
    expect(largeTimes).not.toContain("16:00");
    expect(largeTimes).toContain("15:00");
    expect(largeTimes[0]).toBe("09:00");
  });

  it("excludes start times whose duration would finish after 8:00 PM close", async () => {
    setupExactTimeData({});
    // A 5-hour (300 min) cleaning: 16:00 start would end at 21:00 — excluded.
    // 15:00 start ends at 20:00 exactly — still allowed (finishes AT close).
    const result = await getAvailableStartTimes("2026-09-20", 300, FAR_BEFORE_FIXTURES);
    expect(result).toContain("15:00");
    expect(result).not.toContain("16:00");
  });

  it("returns an empty list for a blackout date", async () => {
    setupExactTimeData({ blackout: [["2026-09-21", "Holiday", "TRUE"]] });
    const result = await getAvailableStartTimes("2026-09-21", 60, FAR_BEFORE_FIXTURES);
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
    const result = await getAvailableStartTimes("2026-09-23", 60, FAR_BEFORE_FIXTURES);
    expect(result).not.toContain("09:00");
    expect(result).not.toContain("10:00");
    expect(result).toContain("14:00");
  });
});

// Reconciliation with the Production 120-hour minimum-lead-time rule:
// applied against the customer's exact selected start time (not a
// calendar-day granularity), replacing the old minimumLeadDays check for
// both new bookings and rescheduling — see dateUtils.ts's
// isLessThanMinimumLeadTime and this module's own docstrings.
describe("checkExactTimeAvailability — 120-hour minimum lead time", () => {
  it("rejects a candidate less than 120 hours away with reason 'too-soon'", async () => {
    setupExactTimeData({});
    // 2:00 PM EDT June 15 = 2026-06-15T18:00:00Z. One minute after the
    // 120h-before instant (2026-06-10T18:00:00Z) is one minute short of 120h.
    const now = new Date("2026-06-10T18:01:00.000Z");
    const result = await checkExactTimeAvailability("2026-06-15", "14:00", 60, now);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("too-soon");
  });

  it("accepts a candidate exactly 120 hours away", async () => {
    setupExactTimeData({});
    const now = new Date("2026-06-10T18:00:00.000Z"); // exactly 120h before 2026-06-15T18:00:00Z
    const result = await checkExactTimeAvailability("2026-06-15", "14:00", 60, now);
    expect(result.available).toBe(true);
  });

  it("rejects a candidate one minute inside the 120-hour boundary", async () => {
    setupExactTimeData({});
    const now = new Date("2026-06-10T18:01:00.000Z");
    const result = await checkExactTimeAvailability("2026-06-15", "14:00", 60, now);
    expect(result.available).toBe(false);
  });

  it("accepts a candidate safely beyond 120 hours away", async () => {
    setupExactTimeData({});
    const now = new Date("2026-06-08T18:00:00.000Z"); // 168h (7 days) before
    const result = await checkExactTimeAvailability("2026-06-15", "14:00", 60, now);
    expect(result.available).toBe(true);
  });

  it("still rejects a blacked-out date with reason 'blackout', not 'too-soon', when it is otherwise far enough out", async () => {
    setupExactTimeData({ blackout: [["2026-06-20", "Holiday", "TRUE"]] });
    const result = await checkExactTimeAvailability("2026-06-20", "14:00", 60, FAR_BEFORE_FIXTURES);
    expect(result.available).toBe(false);
    expect(result.reason).toBe("blackout");
  });

  it("resolves the 120-hour boundary correctly across the spring-forward DST transition (2026-03-08)", async () => {
    setupExactTimeData({});
    // 1:00 PM EDT March 8 (already past the 2am transition) = 2026-03-08T17:00:00Z.
    // The real 120h-before instant is 2026-03-03T17:00:00Z, regardless of
    // the lost hour in between — pure UTC-instant arithmetic, no naive
    // calendar-day subtraction.
    const exactlyOnBoundary = new Date("2026-03-03T17:00:00.000Z");
    const oneMinuteShort = new Date("2026-03-03T17:01:00.000Z");
    const onBoundaryResult = await checkExactTimeAvailability("2026-03-08", "13:00", 60, exactlyOnBoundary);
    const shortResult = await checkExactTimeAvailability("2026-03-08", "13:00", 60, oneMinuteShort);
    expect(onBoundaryResult.available).toBe(true);
    expect(shortResult.available).toBe(false);
    expect(shortResult.reason).toBe("too-soon");
  });

  it("resolves the 120-hour boundary correctly across the fall-back DST transition (2026-11-01)", async () => {
    setupExactTimeData({});
    // 1:00 PM EST November 1 (already past the 2am transition) = 2026-11-01T18:00:00Z.
    // The real 120h-before instant is 2026-10-27T18:00:00Z.
    const exactlyOnBoundary = new Date("2026-10-27T18:00:00.000Z");
    const oneMinuteShort = new Date("2026-10-27T18:01:00.000Z");
    const onBoundaryResult = await checkExactTimeAvailability("2026-11-01", "13:00", 60, exactlyOnBoundary);
    const shortResult = await checkExactTimeAvailability("2026-11-01", "13:00", 60, oneMinuteShort);
    expect(onBoundaryResult.available).toBe(true);
    expect(shortResult.available).toBe(false);
  });
});

describe("getAvailableStartTimes — 120-hour minimum lead time", () => {
  it("excludes only the candidates less than 120 hours away, keeping later ones on the same date", async () => {
    setupExactTimeData({});
    // 10:00 AM EDT June 14 = 2026-06-14T14:00:00Z. On 2026-06-19 (5 days
    // later, EDT UTC-4): 09:00 local is <120h away (119h); 10:00 local is
    // exactly 120h away; 11:00 onward are safely beyond. (8:00 AM is no
    // longer an offered start at all — earliest start is 9:00 AM.)
    const now = new Date("2026-06-14T14:00:00.000Z");
    const result = await getAvailableStartTimes("2026-06-19", 60, now);
    expect(result).not.toContain("09:00");
    expect(result).toContain("10:00");
    expect(result).toContain("11:00");
    expect(result).toContain("16:00");
  });

  it("returns an empty list when every candidate on the date is less than 120 hours away", async () => {
    setupExactTimeData({});
    // 7:00 PM EDT June 14 = 2026-06-14T23:00:00Z. Even the latest offered
    // start (4:00 PM local) on 2026-06-19 — 5 days later — is only 117h
    // away, still under the 120h minimum for every hour that day.
    const now = new Date("2026-06-14T23:00:00.000Z");
    const result = await getAvailableStartTimes("2026-06-19", 60, now);
    expect(result).toEqual([]);
  });
});

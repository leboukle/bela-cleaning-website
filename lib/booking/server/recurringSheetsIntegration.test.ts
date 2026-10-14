import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FakeSheets as FakeSheetsType } from "./fakeSheets";

// The REAL repository classes run against a stateful Sheets simulator
// (fakeSheets.ts): their actual A1 ranges, column lookups, append-row
// numbers and read-back ordering are what decide every contested outcome
// below. Only sheetsClient (the HTTP layer) is replaced.
const sheetsRef = vi.hoisted(() => ({ impl: null as unknown as FakeSheetsType }));
vi.mock("./sheetsClient", () => ({
  getRange: (range: string) => sheetsRef.impl.getRange(range),
  batchGetRanges: (ranges: string[]) => sheetsRef.impl.batchGetRanges(ranges),
  appendRow: (range: string, row: Array<string | number | boolean>) => sheetsRef.impl.appendRow(range, row),
  updateRange: (range: string, row: Array<string | number | boolean>) => sheetsRef.impl.updateRange(range, row),
  batchUpdateRanges: (updates: Array<{ range: string; row: Array<string | number | boolean> }>) =>
    sheetsRef.impl.batchUpdateRanges(updates),
}));
vi.mock("./settings", () => ({ getBookingSettings: vi.fn() }));
vi.mock("./availability", () => ({ checkDateAvailability: vi.fn(), checkExactTimeAvailability: vi.fn() }));
vi.mock("./stripe/paymentIntent", () => ({ createOffSessionPaymentIntent: vi.fn(), retrievePaymentIntent: vi.fn() }));

import { FakeSheets } from "./fakeSheets";
import { getBookingSettings } from "./settings";
import { checkExactTimeAvailability } from "./availability";
import { createOffSessionPaymentIntent } from "./stripe/paymentIntent";
import { GoogleSheetsBookingRepository } from "./googleSheetsRepository";
import { DUPLICATE_STATUS, GoogleRecurringScheduleRepository, runClaimSelfTest } from "./googleRecurringScheduleRepository";
import { BOOKINGS_COLUMNS } from "./bookingsSheetSchema";
import { SCHEDULE_COLUMNS, SCHEDULE_EVENT_COLUMNS, SCHEDULES_SHEET_NAME, SCHEDULE_EVENTS_SHEET_NAME } from "./recurringScheduleSchema";
import {
  afterAppointmentChanged,
  buildScheduleFromInitialBooking,
  generateNextOccurrence,
  reconcileSchedule,
  stopRecurringByToken,
  type RecurringDeps,
} from "./recurringScheduleService";
import { processDueBooking } from "./paymentProcessingService";
import { makeNotifications } from "./recurringTestHarness";
import { hashManageToken } from "./manageToken";
import { sampleBookingRecord } from "./testFixtures";
import type { BookingRecord } from "./types";
import { FIRST_VISIT_PRICING_POLICY } from "@/lib/booking/recurringPricing";

const NOW = new Date("2026-10-13T15:00:00.000Z");
const RAW = "R".repeat(43);

let sheets: FakeSheets;
let bookings: GoogleSheetsBookingRepository;
let schedules: GoogleRecurringScheduleRepository;
let notifications: ReturnType<typeof makeNotifications>;
let deps: RecurringDeps;

function initialRecord(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return sampleBookingRecord({
    bookingId: "BELA-20261102-SHEETS",
    submittedAt: "2026-10-13T15:00:00.000Z",
    paymentStatus: "Scheduled",
    serviceDate: "2026-11-02",
    arrivalWindow: "",
    serviceStartTime: "09:00",
    extras: "none",
    frequency: "Weekly",
    baseCleaningPrice: 130,
    bathroomPrice: 20,
    squareFootagePrice: 15,
    cleaningTypePrice: 0,
    extrasPrice: 0,
    subtotal: 165,
    frequencyDiscount: 0,
    totalPrice: 165,
    originalBookingTotal: 165,
    chargeAmount: 165,
    estimatedDurationMinutes: 240,
    scheduledChargeAt: "2026-11-02T19:00:00.000Z",
    stripeCustomerId: "cus_sheet",
    stripePaymentMethodId: "pm_sheet",
    pricingPolicy: FIRST_VISIT_PRICING_POLICY,
    recurringScheduleId: "BELA-20261102-SHEETS",
    occurrenceNumber: 1,
    manageBookingTokenHash: hashManageToken(RAW),
    ...overrides,
  });
}

async function seed(overrides: Partial<BookingRecord> = {}) {
  const record = initialRecord(overrides);
  await bookings.appendBooking(record);
  const schedule = buildScheduleFromInitialBooking(record, true, "America/New_York");
  await schedules.createSchedule(schedule);
  return record;
}

/** Parsed view of the Bookings worksheet, straight from the simulated cells. */
function bookingRows(): Array<Record<string, string>> {
  const [header, ...rest] = sheets.rows("Bookings");
  return rest.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])));
}
function occurrence(n: number) {
  return bookingRows().filter((r) => r["Occurrence Number"] === String(n));
}
const live = (rows: Array<Record<string, string>>) => rows.filter((r) => r["Booking Status"] !== "Cancelled");

beforeEach(() => {
  sheets = new FakeSheets({
    Bookings: BOOKINGS_COLUMNS,
    [SCHEDULES_SHEET_NAME]: SCHEDULE_COLUMNS,
    [SCHEDULE_EVENTS_SHEET_NAME]: SCHEDULE_EVENT_COLUMNS,
  });
  sheetsRef.impl = sheets;
  bookings = new GoogleSheetsBookingRepository();
  schedules = new GoogleRecurringScheduleRepository();
  notifications = makeNotifications();
  deps = { bookings, schedules, notifications };

  vi.mocked(getBookingSettings).mockReset().mockResolvedValue({
    minimumLeadDays: 7,
    defaultDailyCapacity: 2,
    timezone: "America/New_York",
    schemaVersion: 1,
  });
  vi.mocked(checkExactTimeAvailability)
    .mockReset()
    .mockResolvedValue({ available: true, reason: null, maxCapacity: 2, peakConcurrentCount: 0 });
  vi.mocked(createOffSessionPaymentIntent).mockReset().mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_1" });
});

describe("real repositories against the Sheets simulator: basic round trips", () => {
  it("a seeded appointment and schedule read back exactly through the real column lookups", async () => {
    const record = await seed();
    const row = await bookings.getFullBookingRecord(record.bookingId);
    expect(row).toMatchObject({ occurrenceNumber: 1, recurringScheduleId: record.bookingId, totalPrice: 165 });
    const rows = await bookings.listScheduleBookings!(record.bookingId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ bookingId: record.bookingId, occurrenceNumber: 1, paymentStatus: "Scheduled" });
    const schedule = await schedules.getSchedule(record.bookingId);
    expect(schedule).toMatchObject({ status: "Active", recurringPriceTotal: 145.5, frequencyRate: 0.15 });
  });
});

describe("several schedules share the worksheets", () => {
  it("one schedule's rows and open appointment never affect another schedule", async () => {
    const a = await seed();
    const b = await seed({ bookingId: "BELA-20261103-OTHERB", recurringScheduleId: "BELA-20261103-OTHERB", serviceDate: "2026-11-03", email: "other@example.com" });
    expect((await bookings.listScheduleBookings!(a.bookingId)).map((r) => r.bookingId)).toEqual([a.bookingId]);
    expect((await bookings.listScheduleBookings!(b.bookingId)).map((r) => r.bookingId)).toEqual([b.bookingId]);

    // A is completed and generates; B (still open) must neither block nor be affected.
    await bookings.markBookingCompleted(a.bookingId, "11/02/2026, 2:00:00 PM EST");
    const created = await generateNextOccurrence(a.bookingId, deps, NOW);
    expect(created.outcome).toBe("created");
    expect((await generateNextOccurrence(b.bookingId, deps, NOW)).outcome).toBe("has-open-appointment");
    expect(bookingRows().filter((r) => r["Recurring Schedule ID"] === b.bookingId)).toHaveLength(1);
  });
});

describe("concurrent initial schedule creation", () => {
  it("exactly one schedule row wins; every loser neutralizes its own row", async () => {
    const record = initialRecord();
    await bookings.appendBooking(record);
    const schedule = buildScheduleFromInitialBooking(record, true, "America/New_York");

    const results = await Promise.all(Array.from({ length: 6 }, () => schedules.createSchedule({ ...schedule })));

    expect(results.filter((r) => r.created)).toHaveLength(1);
    const rows = sheets.rows(SCHEDULES_SHEET_NAME).slice(1);
    const sameId = rows.filter((r) => r[0] === record.bookingId);
    // The check-before-append may let several append; the arbitration leaves ONE live row.
    expect(sameId.filter((r) => r[1] !== DUPLICATE_STATUS)).toHaveLength(1);
    expect(await schedules.listScheduleIds(["Active"])).toEqual([record.bookingId]);
    expect((await schedules.listSchedules()).map((s) => s.scheduleId)).toEqual([record.bookingId]);

    // Later writes target the live row, never a duplicate.
    await schedules.updateSchedule(record.bookingId, { reviewReason: "blackout" });
    expect((await schedules.getSchedule(record.bookingId))?.reviewReason).toBe("blackout");
  });
});

describe("claim arbitration (notifications and alerts) on real sheet reads and writes", () => {
  it.each([2, 5, 12])("%i concurrent claims on one key produce exactly one winner", async (n) => {
    const results = await Promise.all(Array.from({ length: n }, () => schedules.claimOnce("k:1", "S1", "d", NOW)));
    expect(results.filter(Boolean)).toHaveLength(1);
    // Every contender left an audit row; only the earliest counts.
    expect(sheets.rows(SCHEDULE_EVENTS_SHEET_NAME).slice(1).filter((r) => r[5] === "k:1")).toHaveLength(n);
  });

  it("different keys never block each other", async () => {
    const results = await Promise.all([
      schedules.claimOnce("a", "S", "", NOW),
      schedules.claimOnce("b", "S", "", NOW),
      schedules.claimOnce("c", "S", "", NOW),
    ]);
    expect(results).toEqual([true, true, true]);
  });

  it("a later claim for an already-claimed key loses", async () => {
    expect(await schedules.claimOnce("once", "S", "", NOW)).toBe(true);
    expect(await schedules.claimOnce("once", "S", "", NOW)).toBe(false);
  });

  it("the live self-test logic reports a pass against this sheet", async () => {
    const result = await runClaimSelfTest(schedules, 10, NOW);
    expect(result).toMatchObject({ contenders: 10, winners: 1, passed: true });
  });
});

describe("concurrent occurrence creation on the real Bookings worksheet", () => {
  it("N simultaneous generation requests leave exactly one live appointment, one confirmation, and no billable duplicate", async () => {
    const record = await seed();
    await bookings.markBookingCompleted(record.bookingId, "11/02/2026, 2:00:00 PM EST");

    const outcomes = await Promise.all(Array.from({ length: 6 }, () => generateNextOccurrence(record.bookingId, deps, NOW)));

    expect(outcomes.filter((o) => o.outcome === "created")).toHaveLength(1);
    const second = occurrence(2);
    expect(live(second)).toHaveLength(1);
    // Anything else that reached the sheet is a voided, never-chargeable row.
    for (const r of second.filter((x) => x["Booking Status"] === "Cancelled")) {
      expect(r["Payment Status"]).toBe("Cancelled — No Charge");
    }
    const winner = live(second)[0];
    expect(winner).toMatchObject({ "Service Date": "2026-11-09", "Total Price": "145.5", "Payment Status": "Scheduled" });
    // The winner is the FIRST row for the occurrence in sheet order.
    expect(second[0]["Booking ID"]).toBe(winner["Booking ID"]);
    expect(notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(1);
    expect(notifications.sendInternalRecurringAppointmentCreated).toHaveBeenCalledTimes(1);
    expect((await schedules.getSchedule(record.bookingId))?.nextOccurrenceNumber).toBe(3);
  });

  it("completion, reconciliation and repeated cancellation racing each other still produce one appointment", async () => {
    const record = await seed();
    await bookings.markBookingCompleted(record.bookingId, "11/02/2026, 2:00:00 PM EST");
    await Promise.all([
      afterAppointmentChanged(record.bookingId, deps, NOW),
      afterAppointmentChanged(record.bookingId, deps, NOW),
      reconcileSchedule(record.bookingId, deps, NOW),
      reconcileSchedule(record.bookingId, deps, NOW),
    ]);
    expect(live(occurrence(2))).toHaveLength(1);
    expect(notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(1);
  });
});

describe("stopping while generation is in flight, on the real worksheets", () => {
  it.each(Array.from({ length: 16 }, (_, i) => i))("leaves no live future appointment (offset %i)", async (offset) => {
    const record = await seed();
    await bookings.markBookingCompleted(record.bookingId, "11/02/2026, 2:00:00 PM EST");

    const stop = (async () => {
      for (let i = 0; i < offset; i++) await Promise.resolve();
      return stopRecurringByToken(RAW, deps, NOW);
    })();
    await Promise.all([generateNextOccurrence(record.bookingId, deps, NOW), stop]);

    expect((await schedules.getSchedule(record.bookingId))?.status).toBe("Ended");
    for (const n of [2, 3]) expect(live(occurrence(n))).toHaveLength(0);
    expect(vi.mocked(createOffSessionPaymentIntent)).not.toHaveBeenCalled();
    await reconcileSchedule(record.bookingId, deps, NOW);
    expect(live(occurrence(2))).toHaveLength(0);
  });
});

describe("crash recovery on the real worksheets", () => {
  it("a write failure right after the booking row was appended is adopted without duplication", async () => {
    const record = await seed();
    await bookings.markBookingCompleted(record.bookingId, "11/02/2026, 2:00:00 PM EST");

    // The progress write (Recurring Schedules cells) fails, as if the function was killed.
    sheets.failWhen = (op, range) => op === "batchUpdate" && range.startsWith(SCHEDULES_SHEET_NAME);
    await expect(generateNextOccurrence(record.bookingId, deps, NOW)).rejects.toThrow(/simulated Sheets failure/);
    expect(occurrence(2)).toHaveLength(1);
    expect((await schedules.getSchedule(record.bookingId))?.nextOccurrenceNumber).toBe(2); // stale

    const later = new Date(NOW.getTime() + 15 * 60_000);
    await Promise.all([reconcileSchedule(record.bookingId, deps, later), reconcileSchedule(record.bookingId, deps, later)]);
    await reconcileSchedule(record.bookingId, deps, later);

    expect(occurrence(2)).toHaveLength(1); // no duplicate
    expect((await schedules.getSchedule(record.bookingId))?.nextOccurrenceNumber).toBe(3);
    expect(notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(1);
    expect(notifications.sendInternalRecurringAppointmentCreated).toHaveBeenCalledTimes(1);
  });

  it("a crash AFTER the claim but BEFORE the email is sent is retried, not lost", async () => {
    const record = await seed();
    await bookings.markBookingCompleted(record.bookingId, "11/02/2026, 2:00:00 PM EST");
    notifications.sendRecurringAppointmentScheduled.mockRejectedValueOnce(new Error("process killed"));

    await generateNextOccurrence(record.bookingId, deps, NOW);
    expect(notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(1);
    expect(occurrence(2)[0]["Customer Confirmation Status"]).not.toBe("Sent");

    const later = new Date(NOW.getTime() + 15 * 60_000);
    await reconcileSchedule(record.bookingId, deps, later);
    expect(notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(2); // retried once…
    await reconcileSchedule(record.bookingId, deps, later);
    await reconcileSchedule(record.bookingId, deps, later);
    expect(notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(2); // …and never again
    expect(occurrence(2)[0]["Customer Confirmation Status"]).toBe("Sent");
  });

  it("an owner alert whose first send failed is retried by the next reconcile, then sent exactly once", async () => {
    const record = await seed();
    await bookings.markBookingCompleted(record.bookingId, "11/02/2026, 2:00:00 PM EST");
    vi.mocked(checkExactTimeAvailability).mockResolvedValue({ available: false, reason: "blackout", maxCapacity: 2, peakConcurrentCount: 0 });
    notifications.sendInternalRecurringScheduleAlert.mockResolvedValueOnce({ ok: false, error: "gmail down" } as never);

    await reconcileSchedule(record.bookingId, deps, NOW);
    await reconcileSchedule(record.bookingId, deps, NOW);
    await reconcileSchedule(record.bookingId, deps, NOW);
    expect(notifications.sendInternalRecurringScheduleAlert).toHaveBeenCalledTimes(2); // failed, then succeeded
    await reconcileSchedule(record.bookingId, deps, NOW);
    expect(notifications.sendInternalRecurringScheduleAlert).toHaveBeenCalledTimes(2);
  });
});

describe("duplicate charges: the pre-charge guard on the real worksheet", () => {
  it("a surviving duplicate occurrence row is never charged; the first row is", async () => {
    const record = await seed();
    await bookings.markBookingCompleted(record.bookingId, "11/02/2026, 2:00:00 PM EST");
    const created = await generateNextOccurrence(record.bookingId, deps, NOW);
    if (created.outcome !== "created") throw new Error("expected created");

    // A duplicate whose writer died before voiding it.
    const original = await bookings.getFullBookingRecord(created.bookingId);
    await bookings.appendBooking({ ...(original as BookingRecord), bookingId: "BELA-DUPLICATE-9", manageBookingTokenHash: "" });

    const afterCharge = new Date("2026-11-09T20:00:00.000Z");
    const notifier = { sendInternalPaymentFailed: vi.fn(async () => ({ ok: true as const })) };
    const dup = await processDueBooking("BELA-DUPLICATE-9", bookings, notifier, afterCharge);
    expect(dup).toMatchObject({ outcome: "skipped-duplicate-occurrence", canonicalBookingId: created.bookingId });
    expect(vi.mocked(createOffSessionPaymentIntent)).not.toHaveBeenCalled();

    const first = await processDueBooking(created.bookingId, bookings, notifier, afterCharge);
    expect(first.outcome).toBe("charge-initiated");
    expect(vi.mocked(createOffSessionPaymentIntent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createOffSessionPaymentIntent).mock.calls[0][0]).toMatchObject({
      bookingId: created.bookingId,
      amountCents: 14550,
      customerId: "cus_sheet",
      paymentMethodId: "pm_sheet",
    });
  });
});

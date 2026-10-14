import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./settings", () => ({ getBookingSettings: vi.fn() }));
vi.mock("./availability", () => ({ checkDateAvailability: vi.fn(), checkExactTimeAvailability: vi.fn() }));
vi.mock("./stripe/paymentIntent", () => ({ createOffSessionPaymentIntent: vi.fn(), retrievePaymentIntent: vi.fn() }));

import { getBookingSettings } from "./settings";
import { checkExactTimeAvailability } from "./availability";
import { buildOwnerDashboard, runSetupCheck, type SheetProbe } from "./ownerRecurringDashboard";
import { afterAppointmentChanged, reconcileSchedule } from "./recurringScheduleService";
import { makeHarness, seedInitialAppointment, type Harness } from "./recurringTestHarness";
import { BOOKINGS_COLUMNS } from "./bookingsSheetSchema";
import { SCHEDULE_COLUMNS, SCHEDULE_EVENT_COLUMNS } from "./recurringScheduleSchema";
import { sampleBookingRecord } from "./testFixtures";

const NOW = new Date("2026-10-13T15:00:00.000Z");
const LATER = new Date("2026-11-03T15:00:00.000Z"); // after the initial visit's date (2026-11-02)
let h: Harness;

const noAssignments = { getLatestAssignmentForBooking: vi.fn(async () => null) };

beforeEach(() => {
  h = makeHarness();
  vi.mocked(getBookingSettings)
    .mockReset()
    .mockResolvedValue({ minimumLeadDays: 7, defaultDailyCapacity: 2, timezone: "America/New_York", schemaVersion: 1 });
  vi.mocked(checkExactTimeAvailability)
    .mockReset()
    .mockResolvedValue({ available: true, reason: null, maxCapacity: 2, peakConcurrentCount: 0 });
});

function probe(overrides: { tabs?: string[]; headers?: Record<string, string[]> } = {}): SheetProbe {
  const headers: Record<string, string[]> = {
    Bookings: [...BOOKINGS_COLUMNS],
    "Recurring Schedules": [...SCHEDULE_COLUMNS],
    "Recurring Schedule Events": [...SCHEDULE_EVENT_COLUMNS],
    ...(overrides.headers ?? {}),
  };
  return {
    overview: async () => ({
      title: "BeLa Cleaning - PREVIEW Bookings",
      idSuffix: "a1B2c3",
      tabTitles: overrides.tabs ?? ["Bookings", "Recurring Schedules", "Recurring Schedule Events", "Blackout Dates"],
    }),
    headerRow: async (tab) => headers[tab] ?? [],
  };
}

describe("setup check", () => {
  it("passes on a correctly prepared sheet and names the sheet it is connected to", async () => {
    const check = await runSetupCheck(probe());
    expect(check.allOk).toBe(true);
    expect(check.spreadsheetTitle).toBe("BeLa Cleaning - PREVIEW Bookings");
    expect(check.spreadsheetIdSuffix).toBe("a1B2c3");
  });

  it("flags missing tabs", async () => {
    const check = await runSetupCheck(probe({ tabs: ["Bookings"] }));
    expect(check.allOk).toBe(false);
    expect(check.items.filter((i) => !i.ok).map((i) => i.label)).toEqual(
      expect.arrayContaining(['Tab "Recurring Schedules"', 'Tab "Recurring Schedule Events"']),
    );
  });

  it("flags a missing Bookings BS1 header with the exact cell and expected text", async () => {
    const withoutBs = BOOKINGS_COLUMNS.slice(0, -1);
    const check = await runSetupCheck(probe({ headers: { Bookings: [...withoutBs] } }));
    const bad = check.items.find((i) => i.label === "Bookings BS1");
    expect(bad?.ok).toBe(false);
    expect(bad?.detail).toContain('expected "Occurrence Number"');
  });

  it("flags a wrong or misordered schedule header", async () => {
    const swapped = [...SCHEDULE_COLUMNS];
    [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
    const check = await runSetupCheck(probe({ headers: { "Recurring Schedules": swapped } }));
    const bad = check.items.find((i) => i.label.includes("row 1") && i.label.includes("Recurring Schedules"));
    expect(bad?.ok).toBe(false);
    expect(bad?.detail).toContain("column 4");
  });
});

describe("owner dashboard", () => {
  async function build(now: Date = LATER) {
    return buildOwnerDashboard({
      bookings: h.bookings,
      schedules: h.schedules,
      assignments: noAssignments,
      timezone: "America/New_York",
      now,
    });
  }

  it("shows an active schedule with its single upcoming appointment and the valid actions", async () => {
    const initial = await seedInitialAppointment(h);
    const dash = await build();
    expect(dash.schedules).toHaveLength(1);
    const card = dash.schedules[0];
    expect(card).toMatchObject({
      scheduleId: initial.bookingId,
      status: "Active",
      needsAttention: false,
      fullPriceTotal: 165,
      recurringPriceTotal: 145.5,
      canSkip: false, // an appointment is already upcoming
      canResume: false,
      canEnd: true,
    });
    expect(card.appointment).toMatchObject({
      bookingId: initial.bookingId,
      occurrenceNumber: 1,
      assignment: "Not assigned",
      canMarkUnperformed: true,
    });
    expect(card.appointment?.statusNote).toMatch(/Charged automatically one hour after the visit ends/);
  });

  it("an appointment whose charge was attempted can no longer be marked unperformed", async () => {
    const initial = await seedInitialAppointment(h);
    h.bookings.byId(initial.bookingId).paymentStatus = "Paid";
    // On the visit's own date: paid, but the date has not passed, so it is still the upcoming appointment.
    const card = (await build(new Date("2026-11-02T22:00:00.000Z"))).schedules[0];
    expect(card.appointment?.canMarkUnperformed).toBe(false);
    expect(card.appointment?.statusNote).toMatch(/^Paid\./);
  });

  it("surfaces a blocked schedule first, with plain-English help and the skip action", async () => {
    const initial = await seedInitialAppointment(h);
    await seedInitialAppointment(h, { bookingId: "BELA-20261103-OTHERB", recurringScheduleId: "BELA-20261103-OTHERB" });
    h.bookings.pay(initial.bookingId);
    vi.mocked(checkExactTimeAvailability).mockResolvedValue({ available: false, reason: "blackout", maxCapacity: 2, peakConcurrentCount: 0 });
    await afterAppointmentChanged(initial.bookingId, h.deps, LATER);

    const dash = await build();
    expect(dash.schedules[0]).toMatchObject({ scheduleId: initial.bookingId, needsAttention: true, reviewReason: "blackout", canSkip: true });
    expect(dash.schedules[0].reviewHelp).toMatch(/blacked-out/i);
    expect(dash.schedules[0].appointment).toBeNull();
    expect(dash.schedules[0].nextRegularDate).toBe("2026-11-09");
    expect(dash.schedules[1].needsAttention).toBe(false);
  });

  it("shows a paused schedule with Resume available", async () => {
    const initial = await seedInitialAppointment(h);
    h.bookings.byId(initial.bookingId).paymentStatus = "Final Failure";
    await reconcileSchedule(initial.bookingId, h.deps, LATER);
    const card = (await build()).schedules[0];
    expect(card).toMatchObject({ status: "Paused", needsAttention: true, canResume: true, canEnd: true });
  });

  it("an ended schedule is listed without actions that no longer apply", async () => {
    const initial = await seedInitialAppointment(h);
    h.schedules.get(initial.bookingId).status = "Ended";
    const card = (await build()).schedules[0];
    expect(card).toMatchObject({ status: "Ended", canSkip: false, canResume: false, canEnd: false, appointment: null });
  });

  it("lists convertible existing bookings from the repository, never converting anything", async () => {
    h.bookings.rows.push(sampleBookingRecord({ bookingId: "BELA-LEGACY-1", occurrenceNumber: 0 }));
    const dash = await buildOwnerDashboard({
      bookings: Object.assign(h.bookings, {
        listRecurringLabelledUnconverted: async () => [
          { bookingId: "BELA-LEGACY-1", firstName: "Ana", lastName: "Ruiz", email: "ana@example.com", frequency: "Weekly", serviceDate: "2026-11-05", serviceStartTime: "10:00", arrivalWindow: "", totalPrice: 130.5, completedAt: "" },
          { bookingId: "BELA-LEGACY-2", firstName: "Bo", lastName: "Lee", email: "bo@example.com", frequency: "Monthly", serviceDate: "2026-11-06", serviceStartTime: "", arrivalWindow: "Morning", totalPrice: 150, completedAt: "" },
        ],
      }),
      schedules: h.schedules,
      assignments: noAssignments,
      timezone: "America/New_York",
      now: NOW,
    });
    expect(dash.convertible.map((c) => [c.bookingId, c.hasExactStartTime])).toEqual([
      ["BELA-LEGACY-1", true],
      ["BELA-LEGACY-2", false],
    ]);
    expect(h.schedules.schedules).toHaveLength(0);
    expect(h.bookings.byId("BELA-LEGACY-1").recurringScheduleId).toBe("");
  });
});

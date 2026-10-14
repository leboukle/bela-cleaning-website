import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./settings", () => ({ getBookingSettings: vi.fn() }));
vi.mock("./availability", () => ({
  checkDateAvailability: vi.fn(),
  checkExactTimeAvailability: vi.fn(),
}));
vi.mock("./stripe/paymentIntent", () => ({
  createOffSessionPaymentIntent: vi.fn(),
  retrievePaymentIntent: vi.fn(),
}));

import { getBookingSettings } from "./settings";
import { checkExactTimeAvailability, type ExactTimeAvailabilityResult } from "./availability";
import { createOffSessionPaymentIntent, retrievePaymentIntent } from "./stripe/paymentIntent";
import {
  type AppointmentChangeOutcome,
  afterAppointmentChanged,
  buildRecurringManageContext,
  convertExistingBookingToSchedule,
  createScheduleFromInitialBooking,
  endScheduleByOwner,
  generateNextOccurrence,
  reconcileSchedule,
  repairMissingSchedule,
  resumeSchedule,
  skipNextOccurrence,
  stopRecurringByToken,
} from "./recurringScheduleService";
import { markBookingUnperformed } from "./completionService";
import { cancelBookingByToken } from "./cancellationService";
import { processDueBooking } from "./paymentProcessingService";
import { hashManageToken } from "./manageToken";
import { INITIAL_RAW_TOKEN, makeHarness, seedInitialAppointment, type Harness } from "./recurringTestHarness";
import { sampleBookingRecord } from "./testFixtures";
import { FIRST_VISIT_PRICING_POLICY } from "@/lib/booking/recurringPricing";

const mockedSettings = vi.mocked(getBookingSettings);
const mockedAvailability = vi.mocked(checkExactTimeAvailability);
const mockedCharge = vi.mocked(createOffSessionPaymentIntent);
const mockedRetrieve = vi.mocked(retrievePaymentIntent);

const SETTINGS = { minimumLeadDays: 7, defaultDailyCapacity: 2, timezone: "America/New_York", schemaVersion: 1 };
const NOW = new Date("2026-10-13T15:00:00.000Z");

const AVAILABLE: ExactTimeAvailabilityResult = { available: true, reason: null, maxCapacity: 2, peakConcurrentCount: 0 };
function unavailable(reason: "blackout" | "at-capacity" | "too-soon"): ExactTimeAvailabilityResult {
  return { available: false, reason, maxCapacity: 2, peakConcurrentCount: 0 };
}

const FULL = 165; // 2 BR + 2 BA + 1,001–2,000 sq ft
const WEEKLY = 145.5; // bedroom base only discounted 15%

let h: Harness;
let scheduleId: string;

async function setup(overrides: Parameters<typeof seedInitialAppointment>[1] = {}) {
  const initial = await seedInitialAppointment(h, overrides);
  scheduleId = initial.recurringScheduleId;
  return initial;
}

/** Marks an appointment complete and advances exactly as the internal route does. */
async function completeAndAdvance(bookingId: string) {
  h.bookings.complete(bookingId);
  return afterAppointmentChanged(bookingId, h.deps, NOW);
}

function createdBookingId(result: AppointmentChangeOutcome): string {
  if (result.outcome !== "created") throw new Error(`expected created, got ${JSON.stringify(result)}`);
  return result.bookingId;
}

beforeEach(() => {
  h = makeHarness();
  mockedSettings.mockReset().mockResolvedValue(SETTINGS);
  mockedAvailability.mockReset().mockResolvedValue(AVAILABLE);
  mockedCharge.mockReset().mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_fee_1" });
  mockedRetrieve.mockReset().mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
describe("schedule creation", () => {
  it("snapshots the agreed service, pricing, anchor and Stripe references from the initial appointment", async () => {
    const initial = await setup();
    const s = h.schedules.get(scheduleId);
    expect(s).toMatchObject({
      scheduleId: initial.bookingId,
      status: "Active",
      frequency: "Weekly",
      frequencyRate: 0.15,
      anchorDate: "2026-11-02",
      anchorStartTime: "09:00",
      timezone: "America/New_York",
      estimatedDurationMinutes: 240,
      baseCleaningPrice: 130,
      bathroomPrice: 20,
      squareFootagePrice: 15,
      fullPriceTotal: 165,
      recurringPriceTotal: 145.5,
      pricingPolicy: FIRST_VISIT_PRICING_POLICY,
      stripeCustomerId: "cus_test",
      stripePaymentMethodId: "pm_test",
      stripeSetupIntentId: "seti_test",
      consentVersion: "recurring-consent-v2",
      sourceBookingId: initial.bookingId,
      nextOccurrenceNumber: 2,
      lastOccurrenceNumber: 1,
    });
    expect(h.schedules.eventsOfType("schedule-created")).toHaveLength(1);
  });

  it("is idempotent: creating the schedule twice leaves one row and one event", async () => {
    const initial = await setup();
    const again = await createScheduleFromInitialBooking(initial, true, h.schedules, "America/New_York");
    expect(again.created).toBe(false);
    expect(h.schedules.schedules).toHaveLength(1);
    expect(h.schedules.eventsOfType("schedule-created")).toHaveLength(1);
  });

  it("recreates a lost schedule row from the initial appointment's own row", async () => {
    const initial = await seedInitialAppointment(h, {}, { createSchedule: false });
    expect(h.schedules.schedules).toHaveLength(0);
    const repaired = await repairMissingSchedule(initial.bookingId, h.deps);
    expect(repaired.repaired).toBe(true);
    expect(h.schedules.get(initial.bookingId).recurringPriceTotal).toBe(145.5);
    expect(h.schedules.eventsOfType("schedule-repaired")).toHaveLength(1);
  });

  it("never converts an existing frequency-labelled booking into a schedule", async () => {
    // A legacy "Weekly" row: no schedule ID, no occurrence number.
    h.bookings.rows.push(sampleBookingRecord({ bookingId: "BELA-LEGACY-1", frequency: "Weekly", recurringScheduleId: "", occurrenceNumber: 0, pricingPolicy: "" }));
    // A Preview-era row: has a schedule ID/policy but no occurrence number.
    h.bookings.rows.push(
      sampleBookingRecord({
        bookingId: "BELA-PREVIEW-1",
        frequency: "Weekly",
        recurringScheduleId: "BELA-PREVIEW-1",
        occurrenceNumber: 0,
        pricingPolicy: FIRST_VISIT_PRICING_POLICY,
      }),
    );
    for (const id of ["BELA-LEGACY-1", "BELA-PREVIEW-1"]) {
      expect((await repairMissingSchedule(id, h.deps)).repaired).toBe(false);
      const reconciled = await reconcileSchedule(id, h.deps, NOW);
      expect(reconciled.generation).toEqual({ outcome: "skipped", reason: "no-schedule" });
      expect((await afterAppointmentChanged(id, h.deps, NOW)).outcome).toBe("not-recurring");
    }
    expect(h.schedules.schedules).toHaveLength(0);
    expect(h.bookings.rows).toHaveLength(2); // nothing created
  });
});

// ---------------------------------------------------------------------------
describe("generation after completion", () => {
  it("creates the next appointment at the existing discount, linked and ready for the existing workflows", async () => {
    const initial = await setup();
    const result = await completeAndAdvance(initial.bookingId);
    if (result.outcome !== "created") throw new Error(JSON.stringify(result));

    const row = h.bookings.byId(result.bookingId);
    expect(row).toMatchObject({
      recurringScheduleId: scheduleId,
      occurrenceNumber: 2,
      serviceDate: "2026-11-09", // +7 days from the anchor
      serviceStartTime: "09:00",
      arrivalWindow: "",
      frequency: "Weekly",
      bookingStatus: "Pending Payment",
      paymentStatus: "Scheduled",
      // The agreed recurring amount: discount on the bedroom base only.
      baseCleaningPrice: 130,
      subtotal: 165,
      frequencyDiscount: 19.5,
      totalPrice: WEEKLY,
      chargeAmount: WEEKLY,
      originalBookingTotal: WEEKLY,
      // The saved card, via the existing off-session integration.
      stripeCustomerId: "cus_test",
      stripePaymentMethodId: "pm_test",
      stripePaymentIntentId: "",
      // service end + 1 hour: 09:00 EST + 4h + 1h = 14:00 EST = 19:00Z
      scheduledChargeAt: "2026-11-09T19:00:00.000Z",
      appointmentReminderStatus: "", // eligible for the existing 72-hour reminder
      completedAt: "",
      pricingPolicy: FIRST_VISIT_PRICING_POLICY,
    });
    expect(row.manageBookingTokenHash).toMatch(/^[0-9a-f]{64}$/);

    const s = h.schedules.get(scheduleId);
    expect(s).toMatchObject({ nextOccurrenceNumber: 3, lastOccurrenceNumber: 2, lastBookingId: result.bookingId, reviewReason: "" });
    expect(h.schedules.eventsOfType("occurrence-created")).toHaveLength(1);
  });

  it("sends exactly one customer confirmation (with a working Manage Booking token) and one owner notice", async () => {
    const initial = await setup();
    const bookingId = createdBookingId(await completeAndAdvance(initial.bookingId));
    expect(h.notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(1);
    expect(h.notifications.sendInternalRecurringAppointmentCreated).toHaveBeenCalledTimes(1);
    const [record, token] = h.notifications.sendRecurringAppointmentScheduled.mock.calls[0] as unknown as [{ bookingId: string }, string];
    expect(record.bookingId).toBe(bookingId);
    expect(hashManageToken(token)).toBe(h.bookings.byId(bookingId).manageBookingTokenHash);
    expect(h.bookings.byId(bookingId)).toMatchObject({ customerConfirmationStatus: "Sent", internalNotificationStatus: "Sent" });
  });

  it("appears in the existing assignable-bookings list; assignment stays manual", async () => {
    const initial = await setup();
    const bookingId = createdBookingId(await completeAndAdvance(initial.bookingId));
    const assignable = await h.bookings.listAssignableBookings();
    expect(assignable.map((b) => b.bookingId)).toContain(bookingId);
  });

  it("keeps at most one upcoming appointment: repeated completion requests create nothing more", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    const first = await afterAppointmentChanged(initial.bookingId, h.deps, NOW);
    const second = await afterAppointmentChanged(initial.bookingId, h.deps, NOW);
    const third = await afterAppointmentChanged(initial.bookingId, h.deps, NOW);
    expect(first.outcome).toBe("created");
    expect(second.outcome).toBe("has-open-appointment");
    expect(third.outcome).toBe("has-open-appointment");
    expect(h.bookings.open(scheduleId)).toHaveLength(1);
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(2);
    expect(h.notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(1);
  });

  it("never generates before the current appointment is completed or cancelled", async () => {
    await setup();
    const result = await generateNextOccurrence(scheduleId, h.deps, NOW);
    expect(result.outcome).toBe("has-open-appointment");
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(1);
  });

  it("preserves the agreed recurring quote when current price configuration differs (priced from the schedule snapshot)", async () => {
    const initial = await setup();
    // The agreed snapshot, not any current configuration, decides the price.
    h.schedules.get(scheduleId).baseCleaningPrice = 130;
    h.schedules.get(scheduleId).frequencyRate = 0.15;
    const bookingId = createdBookingId(await completeAndAdvance(initial.bookingId));
    expect(h.bookings.byId(bookingId).totalPrice).toBe(145.5);
  });

  it("does not touch the previous appointment's saved amounts, Stripe IDs or payment history", async () => {
    const initial = await setup();
    h.bookings.byId(initial.bookingId).paymentStatus = "Paid";
    h.bookings.byId(initial.bookingId).stripePaymentIntentId = "pi_initial_paid";
    const before = { ...h.bookings.byId(initial.bookingId) };
    h.bookings.complete(initial.bookingId);
    await afterAppointmentChanged(initial.bookingId, h.deps, NOW);
    const after = h.bookings.byId(initial.bookingId);
    expect({ ...after, completedAt: "" }).toEqual({ ...before, completedAt: "" });
    expect(after.totalPrice).toBe(165);
    expect(after.stripePaymentIntentId).toBe("pi_initial_paid");
  });
});

// ---------------------------------------------------------------------------
describe("first performed cleaning stays full price", () => {
  it("cancelling the initial appointment does not earn the discount: the next appointment is full price", async () => {
    const initial = await setup();
    // Customer cancels the initial appointment under the existing flow…
    await cancelBookingByToken(INITIAL_RAW_TOKEN, h.bookings, h.notifications, NOW);
    expect(h.bookings.byId(initial.bookingId).bookingStatus).toBe("Cancelled");
    // …and "Cancel this cleaning only" advances the schedule.
    const result = await afterAppointmentChanged(initial.bookingId, h.deps, NOW);
    const next = h.bookings.byId(createdBookingId(result));
    expect(next.occurrenceNumber).toBe(2);
    expect(next.serviceDate).toBe("2026-11-09"); // next REGULAR occurrence from the anchor
    expect(next.frequencyDiscount).toBe(0);
    expect(next.totalPrice).toBe(FULL);

    // Once a cleaning is actually performed, the following one is discounted.
    const third = h.bookings.byId(createdBookingId(await completeAndAdvance(next.bookingId)));
    expect(third.occurrenceNumber).toBe(3);
    expect(third.totalPrice).toBe(WEEKLY);
  });

  it("an unperformed (owner-closed) first appointment also does not earn the discount", async () => {
    const initial = await setup();
    const marked = await markBookingUnperformed(initial.bookingId, h.bookings, NOW);
    expect(marked.outcome).toBe("marked-unperformed");
    const next = h.bookings.byId(createdBookingId(await afterAppointmentChanged(initial.bookingId, h.deps, NOW)));
    expect(next.totalPrice).toBe(FULL);
    expect(next.frequencyDiscount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("cadence anchoring", () => {
  it("weekly: every 7 days from the anchor", async () => {
    const initial = await setup();
    let current = initial.bookingId;
    const dates: string[] = [];
    for (let i = 0; i < 4; i++) {
      current = createdBookingId(await completeAndAdvance(current));
      dates.push(h.bookings.byId(current).serviceDate);
    }
    expect(dates).toEqual(["2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
  });

  it("biweekly: every 14 days from the anchor", async () => {
    const initial = await setup({ frequency: "Every other week" });
    let current = initial.bookingId;
    const dates: string[] = [];
    for (let i = 0; i < 3; i++) {
      current = createdBookingId(await completeAndAdvance(current));
      dates.push(h.bookings.byId(current).serviceDate);
    }
    expect(dates).toEqual(["2026-11-16", "2026-11-30", "2026-12-14"]);
    expect(h.bookings.byId(current).totalPrice).toBe(165 - 13); // 10% of the $130 base
  });

  it("monthly: same numbered date, clamped in short months and back to the anchor day afterwards", async () => {
    const initial = await setup({ frequency: "Monthly", serviceDate: "2027-01-31" });
    let current = initial.bookingId;
    const dates: string[] = [];
    for (let i = 0; i < 5; i++) {
      current = createdBookingId(await completeAndAdvance(current));
      dates.push(h.bookings.byId(current).serviceDate);
    }
    // Feb 28 (2027 is not a leap year), then back to the 31st, Apr 30, May 31, Jun 30.
    expect(dates).toEqual(["2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31", "2027-06-30"]);
  });

  it("monthly: a 29th anchor returns to the 29th and uses Feb 29 in a leap year", async () => {
    const initial = await setup({ frequency: "Monthly", serviceDate: "2027-12-29" });
    let current = initial.bookingId;
    const dates: string[] = [];
    for (let i = 0; i < 3; i++) {
      current = createdBookingId(await completeAndAdvance(current));
      dates.push(h.bookings.byId(current).serviceDate);
    }
    expect(dates).toEqual(["2028-01-29", "2028-02-29", "2028-03-29"]);
  });

  it("preserves local start time across DST (instants shift, the wall-clock 9:00 AM does not)", async () => {
    // DST begins Sun 2027-03-14 in America/New_York.
    const initial = await setup({ serviceDate: "2027-03-01", scheduledChargeAt: "2027-03-01T19:00:00.000Z" });
    const second = h.bookings.byId(createdBookingId(await completeAndAdvance(initial.bookingId))); // Mar 8 (EST)
    const third = h.bookings.byId(createdBookingId(await completeAndAdvance(second.bookingId))); // Mar 15 (EDT)
    expect(second.serviceDate).toBe("2027-03-08");
    expect(second.scheduledChargeAt).toBe("2027-03-08T19:00:00.000Z"); // 14:00 EST
    expect(third.serviceDate).toBe("2027-03-15");
    expect(third.scheduledChargeAt).toBe("2027-03-15T18:00:00.000Z"); // 14:00 EDT — one hour earlier in UTC
    expect(second.serviceStartTime).toBe("09:00");
    expect(third.serviceStartTime).toBe("09:00");
  });

  it("rescheduling or skipping one appointment never shifts the series anchor", async () => {
    const initial = await setup();
    const second = h.bookings.byId(createdBookingId(await completeAndAdvance(initial.bookingId))); // Nov 9
    // The customer reschedules THIS appointment only (existing flow): moved to Nov 12.
    h.bookings.byId(second.bookingId).serviceDate = "2026-11-12";
    h.bookings.byId(second.bookingId).rescheduledAt = "10/20/2026, 9:00:00 AM EDT";
    const third = h.bookings.byId(createdBookingId(await completeAndAdvance(second.bookingId)));
    expect(third.serviceDate).toBe("2026-11-16"); // anchor + 14, not moved date + 7
    expect(h.schedules.get(scheduleId).anchorDate).toBe("2026-11-02");

    // Cancel one, keep the schedule: the next REGULAR occurrence follows.
    await cancelBookingByToken(await tokenFor(third.bookingId), h.bookings, h.notifications, NOW);
    const fourth = h.bookings.byId(createdBookingId(await afterAppointmentChanged(third.bookingId, h.deps, NOW)));
    expect(fourth.occurrenceNumber).toBe(4);
    expect(fourth.serviceDate).toBe("2026-11-23");
  });
});

/** Gives a generated appointment a known raw token so the customer-facing cancel can be exercised. */
async function tokenFor(bookingId: string): Promise<string> {
  const raw = `T${bookingId.replace(/[^A-Z0-9]/g, "")}`.padEnd(43, "x").slice(0, 43);
  await h.bookings.updateManageTokenHash(bookingId, hashManageToken(raw));
  return raw;
}

// ---------------------------------------------------------------------------
describe("owner review instead of silent shifting", () => {
  it("a blacked-out date creates nothing, flags the schedule and alerts the owner exactly once", async () => {
    const initial = await setup();
    mockedAvailability.mockResolvedValue(unavailable("blackout"));
    h.bookings.complete(initial.bookingId);

    const first = await afterAppointmentChanged(initial.bookingId, h.deps, NOW);
    const retry1 = await reconcileSchedule(scheduleId, h.deps, NOW);
    const retry2 = await reconcileSchedule(scheduleId, h.deps, NOW);

    expect(first).toMatchObject({ outcome: "needs-review", reason: "blackout", occurrenceNumber: 2, serviceDate: "2026-11-09" });
    expect(retry1.generation).toMatchObject({ outcome: "needs-review" });
    expect(retry2.generation).toMatchObject({ outcome: "needs-review" });
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(1); // nothing created, nothing shifted
    expect(h.schedules.get(scheduleId)).toMatchObject({ status: "Active", reviewReason: "blackout" });
    expect(h.notifications.sendInternalRecurringScheduleAlert).toHaveBeenCalledTimes(1); // once, not per retry
  });

  it("resumes through the same creation path once the blackout is resolved", async () => {
    const initial = await setup();
    mockedAvailability.mockResolvedValue(unavailable("blackout"));
    h.bookings.complete(initial.bookingId);
    await reconcileSchedule(scheduleId, h.deps, NOW);

    mockedAvailability.mockResolvedValue(AVAILABLE); // owner removed the blackout row
    const resumed = await reconcileSchedule(scheduleId, h.deps, NOW);
    const bookingId = createdBookingId(resumed.generation as never);
    expect(h.bookings.byId(bookingId)).toMatchObject({ occurrenceNumber: 2, serviceDate: "2026-11-09", totalPrice: WEEKLY });
    expect(h.schedules.get(scheduleId).reviewReason).toBe("");
  });

  it("flags a capacity-full date and a too-soon date without bypassing the availability rules", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    mockedAvailability.mockResolvedValue(unavailable("at-capacity"));
    expect(await generateNextOccurrence(scheduleId, h.deps, NOW)).toMatchObject({ outcome: "needs-review", reason: "unavailable" });
    mockedAvailability.mockResolvedValue(unavailable("too-soon"));
    expect(await generateNextOccurrence(scheduleId, h.deps, NOW)).toMatchObject({ outcome: "needs-review", reason: "too-soon" });
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(1);
    // The rule it asked about is the standard one: same date, time and duration as any booking.
    expect(mockedAvailability).toHaveBeenLastCalledWith("2026-11-09", "09:00", 240, NOW);
  });

  it("owner can skip a blocked occurrence: the series continues from the next regular date; the anchor never moves", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    mockedAvailability.mockImplementation(async (date: string) => (date === "2026-11-09" ? unavailable("blackout") : AVAILABLE));
    await generateNextOccurrence(scheduleId, h.deps, NOW);
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(1);

    const skipped = await skipNextOccurrence(scheduleId, h.deps, NOW);
    expect(skipped.outcome).toBe("done");
    const rows = h.bookings.forSchedule(scheduleId);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ occurrenceNumber: 3, serviceDate: "2026-11-16" });
    expect(h.schedules.eventsOfType("occurrence-skipped")).toHaveLength(1);
    expect(h.schedules.get(scheduleId).anchorDate).toBe("2026-11-02");
  });

  it("alerts the owner (once) when a completed visit is never marked complete, instead of stalling silently or assuming completion", async () => {
    await setup(); // visit 2026-11-02, ends 13:00 EST
    const longAfter = new Date("2026-11-04T20:00:00.000Z"); // > 24h after the visit ended
    const r1 = await reconcileSchedule(scheduleId, h.deps, longAfter);
    const r2 = await reconcileSchedule(scheduleId, h.deps, longAfter);
    expect(r1.completionMissing).toBe(true);
    expect(r1.generation).toMatchObject({ outcome: "has-open-appointment" });
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(1); // completion was NOT assumed
    expect(r2.completionMissing).toBe(true);
    expect(h.notifications.sendInternalRecurringScheduleAlert).toHaveBeenCalledTimes(1);
    expect(h.schedules.get(scheduleId).reviewReason).toBe("completion-missing");

    // Marking it complete resolves the review and creates the next appointment.
    const bookingId = createdBookingId(await completeAndAdvance(h.bookings.rows[0].bookingId));
    expect(h.bookings.byId(bookingId).occurrenceNumber).toBe(2);
    expect(h.schedules.get(scheduleId).reviewReason).toBe("");
  });

  it("does not alert while the visit is still recent", async () => {
    await setup();
    const justAfter = new Date("2026-11-02T20:00:00.000Z"); // an hour after the visit ended
    const r = await reconcileSchedule(scheduleId, h.deps, justAfter);
    expect(r.completionMissing).toBeUndefined();
    expect(h.notifications.sendInternalRecurringScheduleAlert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("payment failure", () => {
  it("pauses further generation on final payment failure and alerts the owner once", async () => {
    const initial = await setup();
    h.bookings.byId(initial.bookingId).paymentStatus = "Final Failure";
    h.bookings.complete(initial.bookingId);

    const first = await afterAppointmentChanged(initial.bookingId, h.deps, NOW);
    const again = await reconcileSchedule(scheduleId, h.deps, NOW);
    expect(first).toEqual({ outcome: "paused", reason: "payment-final-failure" });
    expect(again.generation).toMatchObject({ outcome: "skipped" });
    expect(h.schedules.get(scheduleId).status).toBe("Paused");
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(1);
    expect(h.notifications.sendInternalRecurringScheduleAlert).toHaveBeenCalledTimes(1);
  });

  it("resumes only when the owner resumes, acknowledging the failure so it does not immediately re-pause", async () => {
    const initial = await setup();
    h.bookings.byId(initial.bookingId).paymentStatus = "Final Failure";
    h.bookings.complete(initial.bookingId);
    await afterAppointmentChanged(initial.bookingId, h.deps, NOW);

    const resumed = await resumeSchedule(scheduleId, h.deps, NOW);
    expect(resumed.outcome).toBe("done");
    expect(h.schedules.get(scheduleId).status).toBe("Active");
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(2);
    expect(h.schedules.eventsOfType("schedule-resumed")).toHaveLength(1);
  });

  it("resume is refused for a schedule that is not paused", async () => {
    await setup();
    const result = await resumeSchedule(scheduleId, h.deps, NOW);
    expect(result.outcome).toBe("not-applicable");
  });
});

// ---------------------------------------------------------------------------
describe("stopping recurrence", () => {
  it("ends the schedule, cancels the upcoming appointment free of charge, and keeps all history", async () => {
    const initial = await setup();
    h.bookings.byId(initial.bookingId).paymentStatus = "Paid";
    h.bookings.byId(initial.bookingId).stripePaymentIntentId = "pi_paid_1";
    h.bookings.complete(initial.bookingId);
    const upcoming = createdBookingId(await afterAppointmentChanged(initial.bookingId, h.deps, NOW));
    const initialBefore = { ...h.bookings.byId(initial.bookingId) };

    const result = await stopRecurringByToken(INITIAL_RAW_TOKEN, h.deps, NOW);
    if (result.outcome !== "stopped") throw new Error(JSON.stringify(result));

    expect(result.cancelled).toHaveLength(1);
    expect(result.cancelled[0].bookingId).toBe(upcoming);
    expect(result.cancelled[0].result.outcome).toBe("cancelled-free");
    expect(h.bookings.byId(upcoming)).toMatchObject({ bookingStatus: "Cancelled", paymentStatus: "Cancelled — No Charge", cancellationFeeAmount: 0 });
    expect(h.schedules.get(scheduleId)).toMatchObject({ status: "Ended", endedReason: "customer-stopped" });

    // History is retained, not deleted or rewritten.
    expect(h.bookings.rows).toHaveLength(2);
    expect(h.bookings.byId(initial.bookingId)).toEqual(initialBefore);
    expect(mockedCharge).not.toHaveBeenCalled();
  });

  it("no further appointments can be generated afterwards, by any trigger", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    await afterAppointmentChanged(initial.bookingId, h.deps, NOW);
    await stopRecurringByToken(INITIAL_RAW_TOKEN, h.deps, NOW);

    expect(await generateNextOccurrence(scheduleId, h.deps, NOW)).toMatchObject({ outcome: "schedule-not-active", status: "Ended" });
    expect((await reconcileSchedule(scheduleId, h.deps, NOW)).generation).toMatchObject({ outcome: "skipped" });
    expect((await skipNextOccurrence(scheduleId, h.deps, NOW)).outcome).toBe("not-applicable");
    expect(h.bookings.open(scheduleId)).toHaveLength(0);
  });

  it("is idempotent: stopping twice cancels nothing twice", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    await afterAppointmentChanged(initial.bookingId, h.deps, NOW);
    const first = await stopRecurringByToken(INITIAL_RAW_TOKEN, h.deps, NOW);
    const second = await stopRecurringByToken(INITIAL_RAW_TOKEN, h.deps, NOW);
    expect(first.outcome).toBe("stopped");
    expect(second.outcome).toBe("already-ended");
    expect(h.schedules.eventsOfType("schedule-ended")).toHaveLength(1);
    expect(h.notifications.sendFreeCancellationConfirmation).toHaveBeenCalledTimes(1);
  });

  it("applies the EXISTING late-cancellation fee when the upcoming appointment is within 24 hours", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    const upcoming = createdBookingId(await afterAppointmentChanged(initial.bookingId, h.deps, NOW));
    // 2026-11-09 09:00 EST = 14:00Z. Stop at 05:00Z the same day: 9 hours out.
    const lateNow = new Date("2026-11-09T05:00:00.000Z");
    const result = await stopRecurringByToken(INITIAL_RAW_TOKEN, h.deps, lateNow);
    if (result.outcome !== "stopped") throw new Error(JSON.stringify(result));
    expect(result.cancelled[0].result.outcome).toBe("cancelled-fee-initiated");
    expect(h.bookings.byId(upcoming).cancellationFeeAmount).toBe(72.75); // 50% of 145.50
    expect(mockedCharge).toHaveBeenCalledTimes(1);
    expect(mockedCharge.mock.calls[0][0]).toMatchObject({ amountCents: 7275, metadataType: "cancellation_fee" });
    expect(h.schedules.get(scheduleId).status).toBe("Ended");
  });

  it("works from the link of an older, already-completed appointment and cancels the schedule's actual upcoming one", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    const upcoming = createdBookingId(await afterAppointmentChanged(initial.bookingId, h.deps, NOW));
    const result = await stopRecurringByToken(INITIAL_RAW_TOKEN, h.deps, NOW); // INITIAL token = the completed #1
    if (result.outcome !== "stopped") throw new Error(JSON.stringify(result));
    expect(result.cancelled.map((c) => c.bookingId)).toEqual([upcoming]);
  });

  it("reports not-recurring for a one-time booking and invalid-token for a bad link", async () => {
    h.bookings.rows.push(
      sampleBookingRecord({ bookingId: "BELA-ONE", frequency: "One time", recurringScheduleId: "", occurrenceNumber: 0, manageBookingTokenHash: hashManageToken("O".repeat(43)) }),
    );
    expect((await stopRecurringByToken("O".repeat(43), h.deps, NOW)).outcome).toBe("not-recurring");
    expect((await stopRecurringByToken("Z".repeat(43), h.deps, NOW)).outcome).toBe("invalid-token");
    expect((await stopRecurringByToken("short", h.deps, NOW)).outcome).toBe("invalid-token");
  });

  it("an owner-ended schedule is handled exactly like a customer stop", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    const upcoming = createdBookingId(await afterAppointmentChanged(initial.bookingId, h.deps, NOW));
    const result = await endScheduleByOwner(scheduleId, h.deps, NOW);
    expect(result.outcome).toBe("done");
    expect(h.bookings.byId(upcoming).bookingStatus).toBe("Cancelled");
    expect(h.schedules.get(scheduleId)).toMatchObject({ status: "Ended", endedReason: "owner-ended" });
  });

  it("reconciliation finishes an interrupted stop (schedule ended, upcoming appointment still open)", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    const upcoming = createdBookingId(await afterAppointmentChanged(initial.bookingId, h.deps, NOW));
    // Simulate a crash right after the schedule was ended.
    h.schedules.get(scheduleId).status = "Ended";
    h.schedules.get(scheduleId).endedReason = "customer-stopped";
    expect(h.bookings.byId(upcoming).bookingStatus).not.toBe("Cancelled");
    await reconcileSchedule(scheduleId, h.deps, NOW);
    expect(h.bookings.byId(upcoming).bookingStatus).toBe("Cancelled");
  });
});

// ---------------------------------------------------------------------------
describe("reliability: concurrency and recovery", () => {
  it("simultaneous generation requests create exactly one appointment and one confirmation", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);

    const results = await Promise.all([
      generateNextOccurrence(scheduleId, h.deps, NOW),
      generateNextOccurrence(scheduleId, h.deps, NOW),
      generateNextOccurrence(scheduleId, h.deps, NOW),
      generateNextOccurrence(scheduleId, h.deps, NOW),
    ]);

    expect(results.filter((r) => r.outcome === "created")).toHaveLength(1);
    const nonCancelledSecond = h.bookings.forSchedule(scheduleId).filter((r) => r.occurrenceNumber === 2 && r.bookingStatus !== "Cancelled");
    expect(nonCancelledSecond).toHaveLength(1);
    expect(h.bookings.open(scheduleId)).toHaveLength(1);
    expect(h.notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(1);
    expect(h.notifications.sendInternalRecurringAppointmentCreated).toHaveBeenCalledTimes(1);
    // The losers' rows (if they got that far) are voided no-charge cancellations, never chargeable.
    for (const r of h.bookings.forSchedule(scheduleId).filter((x) => x.occurrenceNumber === 2 && x.bookingId !== nonCancelledSecond[0].bookingId)) {
      expect(r).toMatchObject({ bookingStatus: "Cancelled", paymentStatus: "Cancelled — No Charge" });
    }
    expect(h.schedules.get(scheduleId)).toMatchObject({ nextOccurrenceNumber: 3, lastOccurrenceNumber: 2 });
  });

  it("completion racing reconciliation (two different triggers) still creates one appointment", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    await Promise.all([
      afterAppointmentChanged(initial.bookingId, h.deps, NOW),
      reconcileSchedule(scheduleId, h.deps, NOW),
      reconcileSchedule(scheduleId, h.deps, NOW),
    ]);
    expect(h.bookings.open(scheduleId)).toHaveLength(1);
    expect(h.bookings.forSchedule(scheduleId).filter((r) => r.bookingStatus !== "Cancelled" && r.occurrenceNumber === 2)).toHaveLength(1);
    expect(h.notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(1);
  });

  it("crash after the booking append but before the schedule update: recovery adopts it without a duplicate, and sends one confirmation", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    h.schedules.failNextUpdates = 1; // the progress write after the append "crashes"

    await expect(generateNextOccurrence(scheduleId, h.deps, NOW)).rejects.toThrow(/simulated crash/);
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(2); // the appointment exists…
    expect(h.schedules.get(scheduleId).nextOccurrenceNumber).toBe(2); // …but progress is stale
    expect(h.notifications.sendRecurringAppointmentScheduled).not.toHaveBeenCalled();

    // The reconciliation scheduler recovers (later: the 10-minute in-flight window has passed).
    const later = new Date(NOW.getTime() + 15 * 60_000);
    const r1 = await reconcileSchedule(scheduleId, h.deps, later);
    const r2 = await reconcileSchedule(scheduleId, h.deps, later);

    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(2); // no duplicate
    expect(r1.repairedProgress).toBe(true);
    expect(r1.notificationsRecovered).toBe(1);
    expect(r2.repairedProgress).toBeUndefined();
    expect(r2.notificationsRecovered).toBe(0);
    expect(h.schedules.get(scheduleId)).toMatchObject({ nextOccurrenceNumber: 3, lastOccurrenceNumber: 2 });
    expect(h.notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(1);
    // The recovered confirmation carries a link that actually opens the appointment.
    const [rec, token] = h.notifications.sendRecurringAppointmentScheduled.mock.calls[0] as unknown as [{ bookingId: string }, string];
    expect(hashManageToken(token)).toBe(h.bookings.byId(rec.bookingId).manageBookingTokenHash);
  });

  it("does not recover a confirmation while creation may still be in flight", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    h.schedules.failNextUpdates = 1;
    await expect(generateNextOccurrence(scheduleId, h.deps, NOW)).rejects.toThrow();
    const stillFresh = new Date(NOW.getTime() + 60_000);
    const r = await reconcileSchedule(scheduleId, h.deps, stillFresh);
    expect(r.notificationsRecovered).toBe(0);
  });

  it("a failed Sheets write while appending creates nothing and a retry succeeds without duplicating", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    h.bookings.appendFailure = new Error("sheets unavailable");
    await expect(generateNextOccurrence(scheduleId, h.deps, NOW)).rejects.toThrow(/sheets unavailable/);
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(1);
    h.bookings.appendFailure = null;
    const retry = await reconcileSchedule(scheduleId, h.deps, NOW);
    expect(retry.generation).toMatchObject({ outcome: "created" });
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(2);
  });

  it("repeated cancellation requests create one next appointment", async () => {
    const initial = await setup();
    const results = [];
    for (let i = 0; i < 3; i++) {
      await cancelBookingByToken(INITIAL_RAW_TOKEN, h.bookings, h.notifications, NOW);
      results.push(await afterAppointmentChanged(initial.bookingId, h.deps, NOW));
    }
    expect(results.map((r) => r.outcome)).toEqual(["created", "has-open-appointment", "has-open-appointment"]);
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(2);
    expect(h.notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(1);
  });

  it.each(Array.from({ length: 14 }, (_, i) => i))(
    "stopping the schedule while generation is in flight leaves no upcoming appointment (offset %i)",
    async (offset) => {
      const initial = await setup();
      h.bookings.complete(initial.bookingId);

      const stop = (async () => {
        for (let i = 0; i < offset; i++) await Promise.resolve();
        return stopRecurringByToken(INITIAL_RAW_TOKEN, h.deps, NOW);
      })();
      await Promise.all([generateNextOccurrence(scheduleId, h.deps, NOW), stop]);

      expect(h.schedules.get(scheduleId).status).toBe("Ended");
      expect(h.bookings.open(scheduleId)).toHaveLength(0);
      // Every appointment generated by the race is Cancelled (and none was charged).
      for (const r of h.bookings.forSchedule(scheduleId).filter((x) => x.occurrenceNumber >= 2)) {
        expect(r.bookingStatus).toBe("Cancelled");
      }
      expect(mockedCharge).not.toHaveBeenCalled();
      // And nothing more is ever created.
      await reconcileSchedule(scheduleId, h.deps, NOW);
      expect(h.bookings.open(scheduleId)).toHaveLength(0);
    },
  );

  it("a stop that fully completes while generation is paused before its append cannot be undone: the late appointment voids itself", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);

    // Generation passes every pre-check, then is held right before its append.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reachedAppend!: () => void;
    const atAppend = new Promise<void>((resolve) => {
      reachedAppend = resolve;
    });
    h.bookings.beforeAppend = async () => {
      reachedAppend();
      await gate;
    };
    const generation = generateNextOccurrence(scheduleId, h.deps, NOW);
    await atAppend;

    // The customer stops recurring cleanings, to completion, in the meantime.
    h.bookings.beforeAppend = null;
    const stopped = await stopRecurringByToken(INITIAL_RAW_TOKEN, h.deps, NOW);
    expect(stopped.outcome).toBe("stopped");
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(1); // nothing to cancel yet

    // Generation now appends — and must withdraw itself rather than leave an orphan.
    release();
    const result = await generation;
    expect(result).toMatchObject({ outcome: "schedule-not-active", status: "Ended" });
    const late = h.bookings.forSchedule(scheduleId).filter((r) => r.occurrenceNumber === 2);
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ bookingStatus: "Cancelled", paymentStatus: "Cancelled — No Charge", cancellationFeeAmount: 0 });
    expect(h.bookings.open(scheduleId)).toHaveLength(0);
    expect(h.notifications.sendRecurringAppointmentScheduled).not.toHaveBeenCalled();
  });

  it("two concurrent recovery runs send the recovered confirmation once", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    h.schedules.failNextUpdates = 1;
    await expect(generateNextOccurrence(scheduleId, h.deps, NOW)).rejects.toThrow();

    const later = new Date(NOW.getTime() + 15 * 60_000);
    const [a, b, c] = await Promise.all([
      reconcileSchedule(scheduleId, h.deps, later),
      reconcileSchedule(scheduleId, h.deps, later),
      reconcileSchedule(scheduleId, h.deps, later),
    ]);
    expect(a.notificationsRecovered + b.notificationsRecovered + c.notificationsRecovered).toBeGreaterThanOrEqual(1);
    expect(h.notifications.sendRecurringAppointmentScheduled).toHaveBeenCalledTimes(1);
    expect(h.notifications.sendInternalRecurringAppointmentCreated).toHaveBeenCalledTimes(1);
    expect(h.bookings.forSchedule(scheduleId)).toHaveLength(2);
  });

  it("reconciliation voids a stray duplicate occurrence and never touches the first row", async () => {
    const initial = await setup();
    const second = createdBookingId(await completeAndAdvance(initial.bookingId));
    // A duplicate that survived (e.g. its writer crashed before voiding itself).
    h.bookings.rows.push({ ...h.bookings.byId(second), bookingId: "BELA-DUPLICATE-1", manageBookingTokenHash: "" });
    const r = await reconcileSchedule(scheduleId, h.deps, NOW);
    expect(r.voidedDuplicates).toBe(1);
    expect(h.bookings.byId("BELA-DUPLICATE-1")).toMatchObject({ bookingStatus: "Cancelled", paymentStatus: "Cancelled — No Charge" });
    expect(h.bookings.byId(second).bookingStatus).toBe("Pending Payment");
    expect((await reconcileSchedule(scheduleId, h.deps, NOW)).voidedDuplicates).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("duplicate occurrence detection before charging", () => {
  async function dueState() {
    const initial = await setup();
    const second = createdBookingId(await completeAndAdvance(initial.bookingId));
    const original = h.bookings.byId(second);
    h.bookings.rows.push({ ...original, bookingId: "BELA-DUPLICATE-2" });
    const afterCharge = new Date("2026-11-09T20:00:00.000Z"); // past scheduledChargeAt 19:00Z
    return { original, afterCharge };
  }

  it("refuses to charge a row that is not the first for its occurrence", async () => {
    const { afterCharge } = await dueState();
    mockedCharge.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_dup" });
    const notifier = { sendInternalPaymentFailed: vi.fn(async () => ({ ok: true as const })) };
    const outcome = await processDueBooking("BELA-DUPLICATE-2", h.bookings, notifier, afterCharge);
    expect(outcome).toMatchObject({ outcome: "skipped-duplicate-occurrence" });
    expect(mockedCharge).not.toHaveBeenCalled();
    expect(h.bookings.byId("BELA-DUPLICATE-2").paymentStatus).toBe("Scheduled"); // untouched
  });

  it("still charges the first row normally, using the saved card and a per-appointment idempotency key", async () => {
    const { original, afterCharge } = await dueState();
    mockedCharge.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_ok" });
    const notifier = { sendInternalPaymentFailed: vi.fn(async () => ({ ok: true as const })) };
    const outcome = await processDueBooking(original.bookingId, h.bookings, notifier, afterCharge);
    expect(outcome).toMatchObject({ outcome: "charge-initiated" });
    expect(mockedCharge).toHaveBeenCalledTimes(1);
    expect(mockedCharge.mock.calls[0][0]).toMatchObject({
      customerId: "cus_test",
      paymentMethodId: "pm_test",
      amountCents: 14550,
      bookingId: original.bookingId,
      idempotencyKey: `charge:${original.bookingId}:attempt:1`,
    });
  });

  it("a cancelled or unperformed appointment can never receive a normal service charge", async () => {
    const initial = await setup();
    await markBookingUnperformed(initial.bookingId, h.bookings, NOW);
    mockedCharge.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_none" });
    const notifier = { sendInternalPaymentFailed: vi.fn(async () => ({ ok: true as const })) };
    const outcome = await processDueBooking(initial.bookingId, h.bookings, notifier, new Date("2026-11-02T20:00:00.000Z"));
    expect(outcome.outcome).toBe("skipped-cancelled");
    expect(mockedCharge).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("explicitly unperformed visits", () => {
  it("closes the appointment as a no-charge cancellation and advances the schedule", async () => {
    const initial = await setup();
    const marked = await markBookingUnperformed(initial.bookingId, h.bookings, NOW);
    expect(marked.outcome).toBe("marked-unperformed");
    expect(h.bookings.byId(initial.bookingId)).toMatchObject({ bookingStatus: "Cancelled", paymentStatus: "Cancelled — No Charge", cancellationFeeAmount: 0 });
    const next = await afterAppointmentChanged(initial.bookingId, h.deps, NOW);
    expect(next.outcome).toBe("created");
  });

  it("refuses once the charge has been attempted or the visit is complete", async () => {
    const initial = await setup();
    h.bookings.byId(initial.bookingId).paymentStatus = "Paid";
    expect((await markBookingUnperformed(initial.bookingId, h.bookings, NOW)).outcome).toBe("already-charged");
    h.bookings.byId(initial.bookingId).paymentStatus = "Scheduled";
    h.bookings.complete(initial.bookingId);
    expect((await markBookingUnperformed(initial.bookingId, h.bookings, NOW)).outcome).toBe("already-completed");
    expect((await markBookingUnperformed("NOPE", h.bookings, NOW)).outcome).toBe("not-found");
  });
});

// ---------------------------------------------------------------------------
describe("owner-assisted conversion of an existing booking", () => {
  const confirmed = { customerConfirmed: true, note: "Confirmed by email with Jane Doe on 2026-10-14" };

  function legacyBooking(overrides: Parameters<typeof sampleBookingRecord>[0] = {}) {
    // Booked under the previous policy: discounted from its first booking, no schedule fields.
    const row = sampleBookingRecord({
      bookingId: "BELA-20260901-LEGACY",
      frequency: "Weekly",
      serviceDate: "2026-11-05",
      arrivalWindow: "",
      serviceStartTime: "10:00",
      paymentStatus: "Scheduled",
      baseCleaningPrice: 130,
      bathroomPrice: 20,
      squareFootagePrice: 0,
      cleaningTypePrice: 0,
      extrasPrice: 0,
      subtotal: 150,
      frequencyDiscount: 19.5,
      totalPrice: 130.5,
      chargeAmount: 130.5,
      originalBookingTotal: 130.5,
      estimatedDurationMinutes: 210,
      scheduledChargeAt: "2026-11-05T19:30:00.000Z",
      pricingPolicy: "",
      recurringScheduleId: "",
      occurrenceNumber: 0,
      stripeCustomerId: "cus_legacy",
      stripePaymentMethodId: "pm_legacy",
      ...overrides,
    });
    h.bookings.rows.push(row);
    return row;
  }

  it("requires explicit customer confirmation and a note; nothing changes without them", async () => {
    const legacy = legacyBooking();
    for (const bad of [
      { customerConfirmed: false, note: "x" },
      { customerConfirmed: true, note: "   " },
    ]) {
      const result = await convertExistingBookingToSchedule(legacy.bookingId, bad, h.deps, NOW);
      expect(result).toMatchObject({ outcome: "refused", reason: "customer-confirmation-required" });
    }
    expect(h.schedules.schedules).toHaveLength(0);
    expect(h.bookings.byId(legacy.bookingId).recurringScheduleId).toBe("");
  });

  it("preserves the booked price, Stripe IDs and payment history; links only the two schedule cells", async () => {
    const legacy = legacyBooking();
    const before = { ...h.bookings.byId(legacy.bookingId) };
    const result = await convertExistingBookingToSchedule(legacy.bookingId, confirmed, h.deps, NOW);
    expect(result).toMatchObject({ outcome: "converted", scheduleId: legacy.bookingId, preservedTotal: 130.5, recurringPriceTotal: 130.5 });

    const after = h.bookings.byId(legacy.bookingId);
    expect({ ...after, recurringScheduleId: "", occurrenceNumber: 0 }).toEqual(before);
    expect(after).toMatchObject({ recurringScheduleId: legacy.bookingId, occurrenceNumber: 1, totalPrice: 130.5, stripeCustomerId: "cus_legacy" });
  });

  it("documents the ongoing arrangement and who confirmed it", async () => {
    const legacy = legacyBooking();
    await convertExistingBookingToSchedule(legacy.bookingId, confirmed, h.deps, NOW);
    const schedule = h.schedules.get(legacy.bookingId);
    expect(schedule).toMatchObject({
      pricingPolicy: "converted-existing-v1",
      consentVersion: "owner-confirmed-conversion-v1",
      anchorDate: "2026-11-05",
      anchorStartTime: "10:00",
      frequencyRate: 0.15,
      fullPriceTotal: 150,
      recurringPriceTotal: 130.5,
      stripePaymentMethodId: "pm_legacy",
    });
    const [event] = h.schedules.eventsOfType("schedule-converted");
    expect(event.detail).toContain("Booked amount preserved at $130.5");
    expect(event.detail).toContain("ongoing per-appointment total $130.5");
    expect(event.detail).toContain("Confirmed by email with Jane Doe on 2026-10-14");
  });

  it("continues through the normal path: completing it creates the next appointment at the agreed amount", async () => {
    const legacy = legacyBooking();
    await convertExistingBookingToSchedule(legacy.bookingId, confirmed, h.deps, NOW);
    h.bookings.complete(legacy.bookingId);
    const next = h.bookings.byId(createdBookingId(await afterAppointmentChanged(legacy.bookingId, h.deps, NOW)));
    expect(next).toMatchObject({ occurrenceNumber: 2, serviceDate: "2026-11-12", serviceStartTime: "10:00", totalPrice: 130.5, frequencyDiscount: 19.5 });
  });

  it("an already-performed booking gets its next appointment immediately", async () => {
    const legacy = legacyBooking({ completedAt: "11/05/2026, 2:00:00 PM EST" });
    const result = await convertExistingBookingToSchedule(legacy.bookingId, confirmed, h.deps, NOW);
    if (result.outcome !== "converted") throw new Error(JSON.stringify(result));
    expect(result.generation).toMatchObject({ outcome: "created", occurrenceNumber: 2 });
  });

  it("refuses cancelled, one-time, already-linked and arrival-window-only bookings", async () => {
    const cancelled = legacyBooking({ bookingId: "BELA-C", bookingStatus: "Cancelled" });
    const oneTime = legacyBooking({ bookingId: "BELA-O", frequency: "One time" });
    const linked = legacyBooking({ bookingId: "BELA-L", recurringScheduleId: "BELA-L", occurrenceNumber: 1 });
    const windowOnly = legacyBooking({ bookingId: "BELA-W", serviceStartTime: "", arrivalWindow: "Morning" });
    const reasons = await Promise.all(
      [cancelled, oneTime, linked, windowOnly].map(async (b) => {
        const r = await convertExistingBookingToSchedule(b.bookingId, confirmed, h.deps, NOW);
        return r.outcome === "refused" ? r.reason : r.outcome;
      }),
    );
    expect(reasons).toEqual(["booking-cancelled", "not-recurring-frequency", "already-in-a-schedule", "exact-start-time-required"]);
    expect((await convertExistingBookingToSchedule("NOPE", confirmed, h.deps, NOW))).toMatchObject({ reason: "booking-not-found" });
    expect(h.schedules.schedules).toHaveLength(0);
  });

  it("a Preview-era row (schedule ID, no occurrence number) can be converted deliberately", async () => {
    const preview = legacyBooking({ bookingId: "BELA-PREVIEW-2", recurringScheduleId: "BELA-PREVIEW-2", pricingPolicy: FIRST_VISIT_PRICING_POLICY });
    const result = await convertExistingBookingToSchedule(preview.bookingId, confirmed, h.deps, NOW);
    expect(result.outcome).toBe("converted");
    expect(h.bookings.byId(preview.bookingId).occurrenceNumber).toBe(1);
  });

  it("is not repeatable: a second conversion is refused and creates nothing", async () => {
    const legacy = legacyBooking();
    await convertExistingBookingToSchedule(legacy.bookingId, confirmed, h.deps, NOW);
    const again = await convertExistingBookingToSchedule(legacy.bookingId, confirmed, h.deps, NOW);
    expect(again).toMatchObject({ outcome: "refused", reason: "already-in-a-schedule" });
    expect(h.schedules.schedules).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("Manage Booking context", () => {
  it("shows the exact appointment 'Stop recurring cleanings' would cancel, with no fee more than 24h out", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    const upcoming = createdBookingId(await afterAppointmentChanged(initial.bookingId, h.deps, NOW));
    const ctx = await buildRecurringManageContext(h.bookings.byId(initial.bookingId), h.deps, NOW);
    expect(ctx).toMatchObject({
      frequency: "Weekly",
      scheduleStatus: "Active",
      canStop: true,
      upcoming: { bookingId: upcoming, serviceDate: "2026-11-09", totalPrice: WEEKLY, isThisAppointment: false, isLateWindow: false, lateCancellationFeeCents: null },
      nextRegularDate: "2026-11-09",
    });
  });

  it("shows the late fee before confirmation when the upcoming appointment is within 24 hours", async () => {
    const initial = await setup();
    h.bookings.complete(initial.bookingId);
    const upcoming = createdBookingId(await afterAppointmentChanged(initial.bookingId, h.deps, NOW));
    const ctx = await buildRecurringManageContext(h.bookings.byId(upcoming), h.deps, new Date("2026-11-09T05:00:00.000Z"));
    expect(ctx?.upcoming).toMatchObject({ isThisAppointment: true, isLateWindow: true, lateCancellationFeeCents: 7275 });
  });

  it("returns null for a non-recurring booking and cannot stop an ended schedule", async () => {
    const one = sampleBookingRecord({ recurringScheduleId: "", occurrenceNumber: 0 });
    expect(await buildRecurringManageContext(one, h.deps, NOW)).toBeNull();
    const initial = await setup();
    await stopRecurringByToken(INITIAL_RAW_TOKEN, h.deps, NOW);
    const ctx = await buildRecurringManageContext(h.bookings.byId(initial.bookingId), h.deps, NOW);
    expect(ctx).toMatchObject({ scheduleStatus: "Ended", canStop: false, upcoming: null, nextRegularDate: null });
  });
});

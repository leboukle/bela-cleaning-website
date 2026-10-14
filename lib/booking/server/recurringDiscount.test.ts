// End-to-end coverage (through the real submitBooking) of the
// first-cleaning-at-full-price policy. Settings, availability and Stripe
// are mocked exactly as in bookingService.test.ts; validation, the
// centralized pricing engine, eligibility resolution, ID/token generation
// and record building all run for real.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./settings", () => ({ getBookingSettings: vi.fn() }));
vi.mock("./availability", () => ({ checkDateAvailability: vi.fn(), checkExactTimeAvailability: vi.fn() }));
vi.mock("./stripe/setupIntent", () => ({ verifySucceededSetupIntent: vi.fn() }));

import { getBookingSettings } from "./settings";
import { checkDateAvailability, checkExactTimeAvailability } from "./availability";
import { verifySucceededSetupIntent } from "./stripe/setupIntent";
import { submitBooking, type NotificationSender } from "./bookingService";
import { resetIdempotencyFastPathForTests } from "./idempotency";
import { evaluateFollowUpEligibility, resolveFollowUpEligibility } from "./followUpEligibility";
import { hashManageToken } from "./manageToken";
import { calculateEstimate } from "@/lib/booking/calculate";
import { FIRST_VISIT_PRICING_POLICY } from "@/lib/booking/recurringPricing";
import { initialExtrasState } from "@/lib/booking/types";
import { sampleBookingRecord } from "./testFixtures";
import type { BookingRepository, IdempotentBookingResult } from "./repository";
import type { BookingRecord, BookingSubmissionInput } from "./types";

const SETTINGS = { minimumLeadDays: 7, defaultDailyCapacity: 2, timezone: "America/New_York", schemaVersion: 1 };

// Only the repository members submitBooking + eligibility actually touch.
class Repo {
  records: BookingRecord[] = [];
  private tokens = new Map<string, IdempotentBookingResult>();

  async appendBooking(record: BookingRecord) {
    this.records.push(record);
    const marker = /idempotency_token:(\S+)/.exec(record.internalNotes)?.[1];
    if (marker) {
      this.tokens.set(marker, {
        bookingId: record.bookingId,
        totalPrice: record.totalPrice,
        estimatedDurationMinutes: record.estimatedDurationMinutes,
        serviceDate: record.serviceDate,
        arrivalWindow: record.arrivalWindow,
        serviceStartTime: record.serviceStartTime,
      });
    }
  }
  async bookingIdExists(id: string) {
    return this.records.some((r) => r.bookingId === id);
  }
  async findRecentBookingByIdempotencyToken(token: string) {
    return this.tokens.get(token) ?? null;
  }
  async updateNotificationStatus() {}
  async getFullBookingRecord(id: string) {
    return this.records.find((r) => r.bookingId === id) ?? null;
  }
  async findBookingIdByManageTokenHash(hash: string) {
    return this.records.find((r) => r.manageBookingTokenHash === hash)?.bookingId ?? null;
  }
  as(): BookingRepository {
    return this as unknown as BookingRepository;
  }
}

function notifications(): NotificationSender {
  return {
    sendCustomerBookingReceived: vi.fn(async () => ({ ok: true as const })),
    sendInternalNewBookingNotification: vi.fn(async () => ({ ok: true as const })),
  };
}

function futureDateKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let tokenCounter = 0;
function input(overrides: Record<string, unknown> = {}): BookingSubmissionInput {
  tokenCounter += 1;
  return {
    idempotencyToken: `recurring-test-${tokenCounter}`,
    honeypot: "",
    propertyType: "apartment",
    propertyTypeOther: "",
    squareFootage: "1001-2000",
    bedrooms: "2",
    bathrooms: "2",
    cleaningType: "standard",
    extras: { kitchenCabinets: false, refrigerator: false, oven: false, interiorWindowsQty: 0, blindsQty: 0, noExtras: true },
    frequency: "weekly",
    zipCode: "07030",
    serviceDate: futureDateKey(30),
    serviceStartTime: "09:00",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    phone: "5551234567",
    addressStreet: "123 Main St",
    addressUnit: "",
    addressCity: "Hoboken",
    addressState: "New Jersey",
    addressZip: "07030",
    someoneHome: "home",
    specialInstructions: "",
    agreedToPolicy: true,
    setupIntentId: "seti_test123",
    ...overrides,
  };
}

// What the browser's own engine would show for the same selections.
function clientTotal(frequency: "one-time" | "weekly" | "biweekly" | "monthly", applyFrequencyDiscount: boolean): number {
  const estimate = calculateEstimate({
    customEstimateTrigger: null,
    bedrooms: "2",
    bathrooms: "2",
    squareFootage: "1001-2000",
    cleaningType: "standard",
    extras: { ...initialExtrasState, noExtras: true },
    frequency,
    applyFrequencyDiscount,
  });
  return estimate!.totalPrice;
}

// 2 BR ($130) + 2 BA ($20) + 1,001–2,000 sq ft ($15) = $165 regular price.
const REGULAR = 165;
const WEEKLY_DISCOUNT = 19.5; // 15% of the $130 bedroom base — percentage and basis unchanged
const FOLLOW_UP_WEEKLY = REGULAR - WEEKLY_DISCOUNT; // 145.5

async function book(repo: Repo, overrides: Record<string, unknown> = {}) {
  const result = await submitBooking(input(overrides), repo.as(), notifications());
  return result;
}

function lastRecord(repo: Repo): BookingRecord {
  return repo.records[repo.records.length - 1];
}

beforeEach(() => {
  resetIdempotencyFastPathForTests();
  vi.mocked(getBookingSettings).mockReset().mockResolvedValue(SETTINGS);
  vi.mocked(checkDateAvailability).mockReset().mockResolvedValue({ available: true, reason: null, maxCapacity: 2, currentCount: 0 });
  vi.mocked(checkExactTimeAvailability)
    .mockReset()
    .mockResolvedValue({ available: true, reason: null, maxCapacity: 2, peakConcurrentCount: 1 });
  vi.mocked(verifySucceededSetupIntent).mockReset().mockResolvedValue({ customerId: "cus_test123", paymentMethodId: "pm_test123" });
});

describe("1. new recurring initial bookings receive no frequency discount", () => {
  it.each([
    ["weekly", "Weekly"],
    ["biweekly", "Every other week"],
    ["monthly", "Monthly"],
  ] as const)("%s: saved at the regular price, frequency preserved, schedule started", async (frequency, label) => {
    const repo = new Repo();
    const result = await book(repo, { frequency });
    expect(result.ok).toBe(true);
    const record = lastRecord(repo);

    expect(record.frequencyDiscount).toBe(0);
    expect(record.totalPrice).toBe(REGULAR);
    expect(record.subtotal).toBe(REGULAR);
    expect(record.frequency).toBe(label); // still recorded even though the discount is zero
    expect(record.pricingPolicy).toBe(FIRST_VISIT_PRICING_POLICY);
    expect(record.recurringScheduleId).toBe(record.bookingId); // its own ID starts the schedule
  });

  it("a returning customer with unrelated history still gets a first-cleaning price when starting a new schedule", async () => {
    const repo = new Repo();
    // An earlier, COMPLETED booking for the same email and address…
    await book(repo, { frequency: "one-time" });
    repo.records[0].completedAt = "10/01/2026, 12:00:00 PM EDT";
    // …does not make a new recurring schedule's first cleaning eligible.
    const result = await book(repo, { frequency: "weekly" });
    expect(result.ok).toBe(true);
    expect(lastRecord(repo).frequencyDiscount).toBe(0);
    expect(lastRecord(repo).totalPrice).toBe(REGULAR);
  });

  it("even a completed earlier RECURRING booking at the same address does not discount a new schedule without its link", async () => {
    const repo = new Repo();
    await book(repo, { frequency: "weekly" });
    repo.records[0].completedAt = "10/01/2026, 12:00:00 PM EDT";
    await book(repo, { frequency: "weekly" }); // same email/address, but no follow-up link
    expect(lastRecord(repo).frequencyDiscount).toBe(0);
    expect(lastRecord(repo).recurringScheduleId).toBe(lastRecord(repo).bookingId); // a NEW schedule
  });
});

describe("2. eligible follow-ups receive the existing frequency discount", () => {
  it("a follow-up linked to a COMPLETED first cleaning gets the weekly 15% of the bedroom base, and continues the schedule", async () => {
    const repo = new Repo();
    const first = await book(repo, { frequency: "weekly" });
    if (!first.ok || !first.manageToken) throw new Error("first booking should succeed");
    repo.records[0].completedAt = "10/01/2026, 12:00:00 PM EDT"; // BeLa's explicit Mark Complete

    const second = await book(repo, {
      frequency: "weekly",
      followUpToken: first.manageToken,
      clientTotalPrice: FOLLOW_UP_WEEKLY,
    });
    expect(second.ok).toBe(true);
    const record = lastRecord(repo);
    expect(record.frequencyDiscount).toBe(WEEKLY_DISCOUNT);
    expect(record.totalPrice).toBe(FOLLOW_UP_WEEKLY);
    expect(record.recurringScheduleId).toBe(repo.records[0].bookingId);
    expect(record.pricingPolicy).toBe(FIRST_VISIT_PRICING_POLICY);
  });

  it("a third cleaning linked through the second keeps the discount and the same schedule", async () => {
    const repo = new Repo();
    const first = await book(repo, { frequency: "biweekly" });
    if (!first.ok || !first.manageToken) throw new Error("first booking should succeed");
    repo.records[0].completedAt = "10/01/2026, 12:00:00 PM EDT";
    const second = await book(repo, { frequency: "biweekly", followUpToken: first.manageToken });
    if (!second.ok || !second.manageToken) throw new Error("second booking should succeed");
    repo.records[1].completedAt = "10/15/2026, 12:00:00 PM EDT";

    await book(repo, { frequency: "biweekly", followUpToken: second.manageToken });
    const third = lastRecord(repo);
    expect(third.frequencyDiscount).toBe(13); // 10% of $130
    expect(third.recurringScheduleId).toBe(repo.records[0].bookingId);
  });

  it("each recurring frequency uses its existing percentage", async () => {
    const expected = { weekly: 19.5, biweekly: 13, monthly: 6.5 } as const;
    for (const frequency of ["weekly", "biweekly", "monthly"] as const) {
      const repo = new Repo();
      const first = await book(repo, { frequency });
      if (!first.ok || !first.manageToken) throw new Error("first booking should succeed");
      repo.records[0].completedAt = "10/01/2026, 12:00:00 PM EDT";
      await book(repo, { frequency, followUpToken: first.manageToken });
      expect(lastRecord(repo).frequencyDiscount).toBe(expected[frequency]);
    }
  });

  it("a one-time booking made through a follow-up link is still full price with no schedule", async () => {
    const repo = new Repo();
    const first = await book(repo, { frequency: "weekly" });
    if (!first.ok || !first.manageToken) throw new Error("first booking should succeed");
    repo.records[0].completedAt = "10/01/2026, 12:00:00 PM EDT";
    await book(repo, { frequency: "one-time", followUpToken: first.manageToken });
    expect(lastRecord(repo).frequencyDiscount).toBe(0);
    expect(lastRecord(repo).recurringScheduleId).toBe("");
  });
});

describe("3. cancelled or unperformed first cleanings do not establish eligibility", () => {
  async function followUpAfter(mutate: (first: BookingRecord) => void) {
    const repo = new Repo();
    const first = await book(repo, { frequency: "weekly" });
    if (!first.ok || !first.manageToken) throw new Error("first booking should succeed");
    mutate(repo.records[0]);
    const result = await book(repo, { frequency: "weekly", followUpToken: first.manageToken });
    return { repo, result };
  }

  it("a first cleaning that was never marked completed (unperformed) → regular price", async () => {
    const { repo, result } = await followUpAfter(() => {});
    expect(result.ok).toBe(true);
    expect(lastRecord(repo).frequencyDiscount).toBe(0);
    expect(lastRecord(repo).totalPrice).toBe(REGULAR);
  });

  it("a cancelled first cleaning → regular price", async () => {
    const { repo } = await followUpAfter((first) => {
      first.bookingStatus = "Cancelled";
    });
    expect(lastRecord(repo).frequencyDiscount).toBe(0);
  });

  it("a first cleaning that was completed and then cancelled still does not qualify", async () => {
    const { repo } = await followUpAfter((first) => {
      first.completedAt = "10/01/2026, 12:00:00 PM EDT";
      first.bookingStatus = "Cancelled";
    });
    expect(lastRecord(repo).frequencyDiscount).toBe(0);
  });

  it("a scheduled/paid-but-not-marked-completed first cleaning does not qualify (only BeLa's completion confirmation does)", async () => {
    const { repo } = await followUpAfter((first) => {
      first.paymentStatus = "Paid";
      first.paidAt = "10/01/2026, 12:00:00 PM EDT";
    });
    expect(lastRecord(repo).frequencyDiscount).toBe(0);
  });

  it("a one-time earlier booking's link does not qualify a recurring follow-up", async () => {
    const repo = new Repo();
    const first = await book(repo, { frequency: "one-time" });
    if (!first.ok || !first.manageToken) throw new Error("first booking should succeed");
    repo.records[0].completedAt = "10/01/2026, 12:00:00 PM EDT";
    await book(repo, { frequency: "weekly", followUpToken: first.manageToken });
    expect(lastRecord(repo).frequencyDiscount).toBe(0);
  });
});

describe("4. one-time bookings are unchanged", () => {
  it("no discount, no schedule, regular price, policy stamped", async () => {
    const repo = new Repo();
    const result = await book(repo, { frequency: "one-time", clientTotalPrice: REGULAR });
    expect(result.ok).toBe(true);
    const record = lastRecord(repo);
    expect(record.frequencyDiscount).toBe(0);
    expect(record.totalPrice).toBe(REGULAR);
    expect(record.recurringScheduleId).toBe("");
    expect(record.frequency).toBe("One time");
  });
});

describe("5. existing (pre-policy) bookings keep their saved amounts and their schedules", () => {
  const legacyWeekly = (): BookingRecord =>
    sampleBookingRecord({
      bookingId: "BELA-20260801-LEGACY",
      frequency: "Weekly",
      frequencyDiscount: 19.5,
      subtotal: 210,
      totalPrice: 190.5,
      chargeAmount: 190.5,
      originalBookingTotal: 190.5,
      pricingPolicy: "",
      recurringScheduleId: "",
      manageBookingTokenHash: hashManageToken("legacy-token-0000000000000000000000000000000000"),
    });

  it("reading a legacy biweekly/monthly/weekly record never re-derives its price", async () => {
    // Eligibility evaluation is pure over the record; nothing here reprices.
    const record = legacyWeekly();
    const before = { ...record };
    evaluateFollowUpEligibility(record);
    expect(record).toEqual(before);
  });

  it("a follow-up linked to a legacy recurring booking continues its schedule WITH the discount (existing policy preserved)", () => {
    const decision = evaluateFollowUpEligibility(legacyWeekly());
    expect(decision).toEqual({ eligible: true, scheduleId: "BELA-20260801-LEGACY", basis: "existing-schedule" });
  });

  it("…but a cancelled legacy booking does not", () => {
    expect(evaluateFollowUpEligibility({ ...legacyWeekly(), bookingStatus: "Cancelled" })).toEqual({
      eligible: false,
      reason: "earlier-booking-cancelled",
    });
  });

  it("a legacy booking's saved discount and total are stable across a full read-modify cycle used by rescheduling", () => {
    const record = legacyWeekly();
    const rescheduled = { ...record, serviceDate: "2026-11-20", serviceStartTime: "11:00", scheduledChargeAt: "2026-11-20T20:00:00.000Z" };
    expect(rescheduled.totalPrice).toBe(190.5);
    expect(rescheduled.chargeAmount).toBe(190.5);
    expect(rescheduled.frequencyDiscount).toBe(19.5);
    expect(rescheduled.originalBookingTotal).toBe(190.5);
  });
});

describe("6. browser manipulation cannot grant a recurring discount", () => {
  it("ignores every client-supplied eligibility claim and prices the first cleaning at the regular amount", async () => {
    const repo = new Repo();
    const result = await book(repo, {
      frequency: "weekly",
      // Claims a hostile client might send — none are read by the server.
      applyFrequencyDiscount: true,
      isReturningCustomer: true,
      returningCustomer: true,
      visitNumber: 2,
      cleaningNumber: 2,
      frequencyDiscount: 19.5,
      totalPrice: FOLLOW_UP_WEEKLY,
      recurringScheduleId: "BELA-20260101-FORGED",
      pricingPolicy: "anything",
    });
    expect(result.ok).toBe(true);
    const record = lastRecord(repo);
    expect(record.frequencyDiscount).toBe(0);
    expect(record.totalPrice).toBe(REGULAR);
    expect(record.recurringScheduleId).toBe(record.bookingId); // not the forged schedule
    expect(record.pricingPolicy).toBe(FIRST_VISIT_PRICING_POLICY);
  });

  it("refuses (and saves nothing) when the browser shows a discounted total the server will not honor", async () => {
    const repo = new Repo();
    const result = await book(repo, { frequency: "weekly", clientTotalPrice: FOLLOW_UP_WEEKLY });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("price-changed");
      if (result.code === "price-changed") expect(result.totalPrice).toBe(REGULAR);
    }
    expect(repo.records).toHaveLength(0);
  });

  it("refuses a discounted total when the follow-up link no longer qualifies (first cleaning cancelled after the quote)", async () => {
    const repo = new Repo();
    const first = await book(repo, { frequency: "weekly" });
    if (!first.ok || !first.manageToken) throw new Error("first booking should succeed");
    repo.records[0].completedAt = "10/01/2026, 12:00:00 PM EDT";
    repo.records[0].bookingStatus = "Cancelled"; // changed after the customer was quoted the discount

    const result = await book(repo, { frequency: "weekly", followUpToken: first.manageToken, clientTotalPrice: FOLLOW_UP_WEEKLY });
    expect(result.ok).toBe(false);
    expect(repo.records).toHaveLength(1); // only the original booking
  });

  it.each([
    ["a malformed token", "not-a-real-token"],
    ["an unknown but well-formed token", "A".repeat(43)],
    ["an empty token", ""],
  ])("%s gives no discount", async (_label, followUpToken) => {
    const repo = new Repo();
    await book(repo, { frequency: "weekly", followUpToken });
    expect(lastRecord(repo).frequencyDiscount).toBe(0);
  });
});

describe("7. displayed, saved, and payment-consumed amounts agree", () => {
  it("first cleaning: client quote == server price == saved total == charge amount == original total == confirmation", async () => {
    const repo = new Repo();
    const shown = clientTotal("weekly", false);
    const result = await book(repo, { frequency: "weekly", clientTotalPrice: shown });
    if (!result.ok) throw new Error("booking should succeed");
    const record = lastRecord(repo);

    expect(shown).toBe(REGULAR);
    expect(result.totalPrice).toBe(shown);
    expect(record.totalPrice).toBe(shown);
    expect(record.chargeAmount).toBe(shown); // the amount the payment scheduler consumes
    expect(record.originalBookingTotal).toBe(shown);
    expect(record.subtotal - record.frequencyDiscount).toBe(shown);
  });

  it("follow-up: client quote (with the server-confirmed discount) == everything saved", async () => {
    const repo = new Repo();
    const first = await book(repo, { frequency: "weekly" });
    if (!first.ok || !first.manageToken) throw new Error("first booking should succeed");
    repo.records[0].completedAt = "10/01/2026, 12:00:00 PM EDT";

    const shown = clientTotal("weekly", true);
    const result = await book(repo, { frequency: "weekly", followUpToken: first.manageToken, clientTotalPrice: shown });
    if (!result.ok) throw new Error("follow-up should succeed");
    const record = lastRecord(repo);

    expect(shown).toBe(FOLLOW_UP_WEEKLY);
    expect(result.totalPrice).toBe(shown);
    expect(record.totalPrice).toBe(shown);
    expect(record.chargeAmount).toBe(shown);
    expect(record.originalBookingTotal).toBe(shown);
  });
});

describe("resolveFollowUpEligibility", () => {
  it("returns no-link without touching the repository when there is no token", async () => {
    const repo = { findBookingIdByManageTokenHash: vi.fn(), getFullBookingRecord: vi.fn() };
    expect(await resolveFollowUpEligibility("", repo)).toEqual({ eligible: false, reason: "no-link" });
    expect(await resolveFollowUpEligibility(null, repo)).toEqual({ eligible: false, reason: "no-link" });
    expect(repo.findBookingIdByManageTokenHash).not.toHaveBeenCalled();
  });

  it("returns invalid-link for an implausible or unknown token", async () => {
    const repo = { findBookingIdByManageTokenHash: vi.fn(async () => null), getFullBookingRecord: vi.fn() };
    expect(await resolveFollowUpEligibility("short", repo)).toEqual({ eligible: false, reason: "invalid-link" });
    expect(await resolveFollowUpEligibility("B".repeat(43), repo)).toEqual({ eligible: false, reason: "invalid-link" });
  });

  it("evaluateFollowUpEligibility: new-policy booking needs Completed At; cancelled and one-time never qualify", () => {
    const base = sampleBookingRecord({ pricingPolicy: FIRST_VISIT_PRICING_POLICY, recurringScheduleId: "BELA-S", completedAt: "" });
    expect(evaluateFollowUpEligibility(base)).toEqual({ eligible: false, reason: "first-cleaning-not-completed" });
    expect(evaluateFollowUpEligibility({ ...base, completedAt: "10/01/2026" })).toEqual({
      eligible: true,
      scheduleId: "BELA-S",
      basis: "completed-first-cleaning",
    });
    expect(evaluateFollowUpEligibility({ ...base, completedAt: "10/01/2026", bookingStatus: "Cancelled" })).toEqual({
      eligible: false,
      reason: "earlier-booking-cancelled",
    });
    expect(evaluateFollowUpEligibility({ ...base, completedAt: "10/01/2026", frequency: "One time" })).toEqual({
      eligible: false,
      reason: "earlier-booking-not-recurring",
    });
  });
});

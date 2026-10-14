import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./settings", () => ({ getBookingSettings: vi.fn() }));
vi.mock("./availability", () => ({ checkDateAvailability: vi.fn(), checkExactTimeAvailability: vi.fn() }));
vi.mock("./stripe/setupIntent", () => ({ verifySucceededSetupIntent: vi.fn() }));

import { getBookingSettings } from "./settings";
import { checkDateAvailability, checkExactTimeAvailability } from "./availability";
import { verifySucceededSetupIntent } from "./stripe/setupIntent";
import { submitBooking, type NotificationSender } from "./bookingService";
import { resetIdempotencyFastPathForTests } from "./idempotency";
import { reconcileSchedule } from "./recurringScheduleService";
import { InMemoryBookings, InMemorySchedules, makeNotifications } from "./recurringTestHarness";
import type { IdempotentBookingResult } from "./repository";
import type { BookingRecord, BookingSubmissionInput } from "./types";
import { FIRST_VISIT_PRICING_POLICY } from "@/lib/booking/recurringPricing";

const SETTINGS = { minimumLeadDays: 7, defaultDailyCapacity: 2, timezone: "America/New_York", schemaVersion: 1 };

// The booking repository double needs real idempotency (a replay must find
// the earlier row) on top of the shared in-memory sheet.
class Bookings extends InMemoryBookings {
  async findRecentBookingByIdempotencyToken(token: string): Promise<IdempotentBookingResult | null> {
    const row = this.rows.find((r) => r.internalNotes.includes(`idempotency_token:${token}`));
    if (!row) return null;
    return {
      bookingId: row.bookingId,
      totalPrice: row.totalPrice,
      estimatedDurationMinutes: row.estimatedDurationMinutes,
      serviceDate: row.serviceDate,
      arrivalWindow: row.arrivalWindow,
      serviceStartTime: row.serviceStartTime,
      cleaningType: row.cleaningType,
      frequency: row.frequency,
      frequencyDiscount: row.frequencyDiscount,
      pricingPolicy: row.pricingPolicy,
    };
  }
}

function emails(): NotificationSender {
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

let counter = 0;
function input(overrides: Record<string, unknown> = {}): BookingSubmissionInput {
  counter += 1;
  return {
    idempotencyToken: `recurring-booking-${counter}`,
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
    recurringConsent: true,
    setupIntentId: "seti_test123",
    ...overrides,
  };
}

let bookings: Bookings;
let schedules: InMemorySchedules;

beforeEach(() => {
  resetIdempotencyFastPathForTests();
  bookings = new Bookings();
  schedules = new InMemorySchedules();
  vi.mocked(getBookingSettings).mockReset().mockResolvedValue(SETTINGS);
  vi.mocked(checkDateAvailability).mockReset().mockResolvedValue({ available: true, reason: null, maxCapacity: 2, currentCount: 0 });
  vi.mocked(checkExactTimeAvailability)
    .mockReset()
    .mockResolvedValue({ available: true, reason: null, maxCapacity: 2, peakConcurrentCount: 1 });
  vi.mocked(verifySucceededSetupIntent).mockReset().mockResolvedValue({ customerId: "cus_test123", paymentMethodId: "pm_test123" });
});

function last(): BookingRecord {
  return bookings.rows[bookings.rows.length - 1];
}

describe("submitting a recurring booking", () => {
  it.each([
    ["weekly", "Weekly", 0.15],
    ["biweekly", "Every other week", 0.1],
    ["monthly", "Monthly", 0.05],
  ] as const)("%s: the initial appointment is full price, occurrence 1, and starts a schedule", async (frequency, label, rate) => {
    const result = await submitBooking(input({ frequency }), bookings, emails(), schedules);
    expect(result.ok).toBe(true);

    expect(last()).toMatchObject({
      frequency: label,
      frequencyDiscount: 0,
      totalPrice: 165,
      subtotal: 165,
      pricingPolicy: FIRST_VISIT_PRICING_POLICY,
      occurrenceNumber: 1,
      stripeCustomerId: "cus_test123",
      stripePaymentMethodId: "pm_test123",
    });
    expect(last().recurringScheduleId).toBe(last().bookingId);

    const schedule = schedules.get(last().bookingId);
    expect(schedule).toMatchObject({
      status: "Active",
      frequency: label,
      frequencyRate: rate,
      anchorDate: last().serviceDate,
      anchorStartTime: "09:00",
      fullPriceTotal: 165,
      stripeCustomerId: "cus_test123",
      stripePaymentMethodId: "pm_test123",
      consentVersion: "recurring-consent-v2",
      nextOccurrenceNumber: 2,
    });
    // The agreed recurring quote: discount on the bedroom base only.
    expect(schedule.recurringPriceTotal).toBe(Math.round((165 - 130 * rate) * 100) / 100);
  });

  it("returns the saved summary for the confirmation (first cleaning at the regular price)", async () => {
    const result = await submitBooking(input({ frequency: "weekly" }), bookings, emails(), schedules);
    if (!result.ok) throw new Error("should succeed");
    expect(result.totalPrice).toBe(165);
    expect(result.saved).toEqual({
      cleaningType: "Standard cleaning",
      frequency: "Weekly",
      frequencyDiscount: 0,
      quoteKind: "first-cleaning",
    });
  });

  it("requires explicit recurring consent; nothing is saved without it", async () => {
    const result = await submitBooking(input({ frequency: "weekly", recurringConsent: false }), bookings, emails(), schedules);
    expect(result.ok).toBe(false);
    if (!result.ok && result.code === "validation") {
      expect(result.issues.map((i) => i.field)).toContain("recurringConsent");
    } else {
      throw new Error("expected a validation failure");
    }
    expect(bookings.rows).toHaveLength(0);
    expect(schedules.schedules).toHaveLength(0);
  });

  it("a one-time booking needs no consent and creates no schedule", async () => {
    const result = await submitBooking(input({ frequency: "one-time", recurringConsent: false }), bookings, emails(), schedules);
    expect(result.ok).toBe(true);
    expect(last()).toMatchObject({ frequency: "One time", frequencyDiscount: 0, totalPrice: 165, recurringScheduleId: "", occurrenceNumber: 0 });
    expect(schedules.schedules).toHaveLength(0);
  });

  it("consent sent with a one-time booking does not create a schedule", async () => {
    await submitBooking(input({ frequency: "one-time", recurringConsent: true }), bookings, emails(), schedules);
    expect(schedules.schedules).toHaveLength(0);
  });

  it("the browser cannot obtain a discount or a different total on a submission", async () => {
    const forged = input({
      frequency: "weekly",
      // None of these is read by the server for pricing:
      followUpToken: "A".repeat(43),
      applyFrequencyDiscount: true,
      frequencyDiscount: 19.5,
      totalPrice: 145.5,
      returningCustomer: true,
      visitNumber: 2,
    });
    const result = await submitBooking(forged, bookings, emails(), schedules);
    expect(result.ok).toBe(true);
    expect(last()).toMatchObject({ frequencyDiscount: 0, totalPrice: 165, chargeAmount: 165, originalBookingTotal: 165 });
  });

  it("refuses a submission whose shown total differs from the authoritative one, saving nothing", async () => {
    const result = await submitBooking(input({ frequency: "weekly", clientTotalPrice: 145.5 }), bookings, emails(), schedules);
    expect(result).toMatchObject({ ok: false, code: "price-changed", totalPrice: 165 });
    expect(bookings.rows).toHaveLength(0);
    expect(schedules.schedules).toHaveLength(0);
  });

  it("a schedule-write failure never fails the booking, and reconciliation recreates the schedule", async () => {
    schedules.failNextCreate = true;
    const result = await submitBooking(input({ frequency: "weekly" }), bookings, emails(), schedules);
    expect(result.ok).toBe(true);
    expect(bookings.rows).toHaveLength(1);
    expect(schedules.schedules).toHaveLength(0);

    const notifications = makeNotifications();
    const outcome = await reconcileSchedule(last().bookingId, { bookings, schedules, notifications }, new Date());
    expect(outcome.repairedSchedule).toBe(true);
    expect(schedules.get(last().bookingId)).toMatchObject({ status: "Active", fullPriceTotal: 165 });
    // The initial appointment is still open, so nothing else is created.
    expect(bookings.rows).toHaveLength(1);
  });

  it("an idempotent replay returns the saved booking and creates no second schedule or appointment", async () => {
    const payload = input({ frequency: "weekly" });
    const first = await submitBooking(payload, bookings, emails(), schedules);
    resetIdempotencyFastPathForTests();
    const replay = await submitBooking({ ...payload, frequency: "monthly" }, bookings, emails(), schedules);
    if (!first.ok || !replay.ok) throw new Error("both should succeed");
    expect(replay.bookingId).toBe(first.bookingId);
    expect(replay.saved.frequency).toBe("Weekly");
    expect(bookings.rows).toHaveLength(1);
    expect(schedules.schedules).toHaveLength(1);
  });
});

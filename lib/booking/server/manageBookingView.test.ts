import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./settings", () => ({ getBookingSettings: vi.fn() }));

import { getBookingSettings } from "./settings";
import { buildManageBookingView } from "./manageBookingView";
import { arrivalWindowStartSpec, calculateServiceStart } from "./serviceTime";
import { PAYMENT_STATUS } from "./bookingsSheetSchema";
import { sampleBookingRecord } from "./testFixtures";

const mockedGetSettings = vi.mocked(getBookingSettings);

const SETTINGS = { minimumLeadDays: 7, defaultDailyCapacity: 2, timezone: "America/New_York", schemaVersion: 1 };

function futureDateKey(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const FUTURE_DATE = futureDateKey(30);
const SCHEDULED_START = calculateServiceStart(FUTURE_DATE, arrivalWindowStartSpec("morning"), SETTINGS.timezone);
const MORE_THAN_24H_BEFORE = new Date(SCHEDULED_START.getTime() - 25 * 60 * 60 * 1000);
const WITHIN_24H_BEFORE = new Date(SCHEDULED_START.getTime() - 2 * 60 * 60 * 1000);

function activeRecord(overrides: Partial<Parameters<typeof sampleBookingRecord>[0]> = {}) {
  return sampleBookingRecord({
    bookingStatus: "Pending Payment",
    paymentStatus: PAYMENT_STATUS.SCHEDULED,
    serviceDate: FUTURE_DATE,
    arrivalWindow: "Morning",
    chargeAmount: 200,
    extras: "kitchenCabinets;interiorWindows:2",
    ...overrides,
  });
}

beforeEach(() => {
  mockedGetSettings.mockReset().mockResolvedValue(SETTINGS);
});

describe("buildManageBookingView", () => {
  it("never includes any Stripe ID or internal-only field", async () => {
    const view = await buildManageBookingView(activeRecord(), MORE_THAN_24H_BEFORE);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("cus_test123");
    expect(serialized).not.toContain("pm_test123");
    expect(serialized).not.toContain("seti_test123");
    expect(view).not.toHaveProperty("stripeCustomerId");
    expect(view).not.toHaveProperty("stripePaymentMethodId");
    expect(view).not.toHaveProperty("stripeSetupIntentId");
    expect(view).not.toHaveProperty("stripePaymentIntentId");
    expect(view).not.toHaveProperty("internalNotes");
    expect(view).not.toHaveProperty("internalNotificationStatus");
    expect(view).not.toHaveProperty("manageBookingTokenHash");
  });

  it("more than 24 hours out: allows both cancel and reschedule, with no fee", async () => {
    const view = await buildManageBookingView(activeRecord(), MORE_THAN_24H_BEFORE);
    expect(view.eligibility).toEqual({
      canCancel: true,
      canReschedule: true,
      isLateWindow: false,
      lateCancellationFeeCents: null,
    });
  });

  it("within 24 hours: allows cancel only, reports the 50% fee, disallows reschedule", async () => {
    const view = await buildManageBookingView(activeRecord(), WITHIN_24H_BEFORE);
    expect(view.eligibility).toEqual({
      canCancel: true,
      canReschedule: false,
      isLateWindow: true,
      lateCancellationFeeCents: 10000, // 50% of $200.00
    });
  });

  it("a cancelled booking is not actionable and skips the timing lookup entirely", async () => {
    const view = await buildManageBookingView(
      activeRecord({ bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLED_NO_CHARGE }),
      MORE_THAN_24H_BEFORE,
    );
    expect(view.eligibility).toEqual({
      canCancel: false,
      canReschedule: false,
      isLateWindow: false,
      lateCancellationFeeCents: null,
    });
    expect(mockedGetSettings).not.toHaveBeenCalled();
  });

  it("an already-paid (completed) booking is not actionable", async () => {
    const view = await buildManageBookingView(activeRecord({ paymentStatus: PAYMENT_STATUS.PAID }), MORE_THAN_24H_BEFORE);
    expect(view.eligibility.canCancel).toBe(false);
    expect(view.eligibility.canReschedule).toBe(false);
    expect(view.displayStatus).toBe("Completed");
  });

  describe("displayStatus", () => {
    it("reports a plain Confirmed for a normal scheduled booking", async () => {
      const view = await buildManageBookingView(activeRecord(), MORE_THAN_24H_BEFORE);
      expect(view.displayStatus).toBe("Confirmed");
    });

    it("reports a plain Cancelled for a free cancellation", async () => {
      const view = await buildManageBookingView(
        activeRecord({ bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLED_NO_CHARGE }),
      );
      expect(view.displayStatus).toBe("Cancelled");
    });

    it("distinguishes the three late-cancellation-fee states", async () => {
      const paid = await buildManageBookingView(
        activeRecord({ bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PAID }),
      );
      const failed = await buildManageBookingView(
        activeRecord({ bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_FAILED }),
      );
      const processing = await buildManageBookingView(
        activeRecord({ bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING }),
      );
      expect(paid.displayStatus).toBe("Cancelled (late-cancellation fee charged)");
      expect(failed.displayStatus).toBe("Cancelled (late-cancellation fee could not be processed)");
      expect(processing.displayStatus).toBe("Cancelled (processing late-cancellation fee)");
    });
  });

  it("exposes the customer-facing booking fields", async () => {
    const view = await buildManageBookingView(activeRecord(), MORE_THAN_24H_BEFORE);
    expect(view.bookingId).toBe("BELA-20260101-ABCDEF");
    expect(view.serviceDate).toBe(FUTURE_DATE);
    expect(view.scheduleDisplayLabel).toBe("Morning (8:00 AM – 10:00 AM)");
    expect(view.streetAddress).toBe("123 Main St");
    expect(view.cleaningType).toBe("Standard cleaning");
    expect(view.estimatedDurationMinutes).toBe(270);
    expect(view.totalPrice).toBe(200);
    expect(view.frequency).toBe("Weekly");
  });

  it("translates the serialized Extras format into a human-readable list", async () => {
    const view = await buildManageBookingView(activeRecord({ extras: "none" }), MORE_THAN_24H_BEFORE);
    expect(view.extras).toEqual([]);

    const withExtras = await buildManageBookingView(activeRecord(), MORE_THAN_24H_BEFORE);
    expect(withExtras.extras).toEqual(["Inside kitchen cabinets", "Interior windows × 2"]);
  });
});

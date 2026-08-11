import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateAuthoritativePricing } from "./pricing";
import type { ValidatedBooking } from "./types";

function sampleBooking(overrides: Partial<ValidatedBooking> = {}): ValidatedBooking {
  return {
    propertyType: "apartment",
    propertyTypeOther: "",
    squareFootage: "1001-2000",
    bedrooms: "2",
    bathrooms: "2",
    cleaningType: "standard",
    extras: {
      kitchenCabinets: true,
      refrigerator: false,
      oven: false,
      interiorWindowsQty: 2,
      blindsQty: 0,
      noExtras: false,
    },
    frequency: "weekly",
    zipCode: "07030",
    city: "Hoboken",
    serviceDate: "2026-09-22",
    arrivalWindow: "morning",
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
    idempotencyToken: "token",
    setupIntentId: "seti_test123",
    ...overrides,
  };
}

describe("calculateAuthoritativePricing", () => {
  it("computes the known totals for a standard booking (2BR/2BA, kitchen cabinets + 2 windows, weekly)", () => {
    const pricing = calculateAuthoritativePricing(sampleBooking());
    expect(pricing).toEqual({
      baseCleaningPrice: 130,
      bathroomPrice: 20,
      cleaningTypePrice: 0,
      extrasPrice: 60,
      subtotal: 210,
      frequencyDiscount: 19.5,
      totalPrice: 190.5,
      estimatedDurationMinutes: 270,
    });
  });

  it("keeps subtotal minus discount consistent with total for every frequency", () => {
    for (const frequency of ["one-time", "weekly", "biweekly", "monthly"] as const) {
      const pricing = calculateAuthoritativePricing(sampleBooking({ frequency }));
      expect(Math.round((pricing.subtotal - pricing.frequencyDiscount) * 100)).toBe(Math.round(pricing.totalPrice * 100));
    }
  });
});

describe("calculateAuthoritativePricing internal-consistency guard", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/booking/calculate");
  });

  it("throws PricingError if the underlying estimate is ever internally inconsistent", async () => {
    vi.doMock("@/lib/booking/calculate", () => ({
      calculateEstimate: () => ({
        bedroomBasePrice: 100,
        discountedBedroomBasePrice: 100,
        bathroomAddition: 0,
        extrasTotal: 0,
        cleaningTypeAddition: 0,
        totalPrice: 999, // deliberately inconsistent with subtotal - discount
        bedroomBaseDurationMinutes: 0,
        bathroomDurationMinutes: 0,
        extrasDurationMinutes: 0,
        cleaningTypeDurationMinutes: 0,
        totalDurationMinutes: 0,
      }),
    }));
    // vi.resetModules() gives this dynamic import a fresh module instance,
    // so its PricingError class is a distinct identity from the one
    // statically imported above — assert against the freshly-imported
    // module's own export, not the outer one, or instanceof would
    // (correctly, if confusingly) fail despite the error being exactly
    // what's expected.
    const brokenModule = await import("./pricing");
    expect(() => brokenModule.calculateAuthoritativePricing(sampleBooking())).toThrow(brokenModule.PricingError);
  });
});

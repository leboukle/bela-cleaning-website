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
    idempotencyToken: "token",
    setupIntentId: "seti_test123",
    ...overrides,
  };
}

describe("calculateAuthoritativePricing", () => {
  it("computes the known totals for a standard booking (2BR/2BA, 1,001–2,000 sq ft, kitchen cabinets + 2 windows, weekly)", () => {
    const pricing = calculateAuthoritativePricing(sampleBooking());
    expect(pricing).toEqual({
      baseCleaningPrice: 130,
      bathroomPrice: 20,
      squareFootagePrice: 25,
      cleaningTypePrice: 0,
      extrasPrice: 60,
      subtotal: 235,
      // Weekly 15% applies to the bedroom base only (130 * 0.15), never to
      // the new square-footage component.
      frequencyDiscount: 19.5,
      totalPrice: 215.5,
      // 150 bedroom + 60 bathrooms + 30 square footage + 60 extras
      estimatedDurationMinutes: 300,
    });
  });

  it("persists each square-footage tier's price and feeds its duration into the authoritative estimate", () => {
    const tiers = [
      { squareFootage: "up-to-1000", price: 0, minutes: 0 },
      { squareFootage: "1001-2000", price: 25, minutes: 30 },
      { squareFootage: "2001-3000", price: 50, minutes: 60 },
      { squareFootage: "3001-4000", price: 75, minutes: 90 },
    ] as const;
    const noExtras = { kitchenCabinets: false, refrigerator: false, oven: false, interiorWindowsQty: 0, blindsQty: 0, noExtras: true };
    const base = calculateAuthoritativePricing(sampleBooking({ squareFootage: "up-to-1000", frequency: "one-time", extras: noExtras }));
    for (const tier of tiers) {
      const pricing = calculateAuthoritativePricing(sampleBooking({ squareFootage: tier.squareFootage, frequency: "one-time", extras: noExtras }));
      expect(pricing.squareFootagePrice).toBe(tier.price);
      expect(pricing.totalPrice).toBe(base.totalPrice + tier.price);
      expect(pricing.subtotal).toBe(base.subtotal + tier.price);
      expect(pricing.estimatedDurationMinutes).toBe(base.estimatedDurationMinutes + tier.minutes);
    }
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
        squareFootageAddition: 0,
        extrasTotal: 0,
        cleaningTypeAddition: 0,
        totalPrice: 999, // deliberately inconsistent with subtotal - discount
        bedroomBaseDurationMinutes: 0,
        bathroomDurationMinutes: 0,
        squareFootageDurationMinutes: 0,
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

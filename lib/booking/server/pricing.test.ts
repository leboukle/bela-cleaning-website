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
    followUpToken: "",
    ...overrides,
  };
}

describe("calculateAuthoritativePricing", () => {
  const FIRST = { applyFrequencyDiscount: false };
  const FOLLOW_UP = { applyFrequencyDiscount: true };

  it("prices a recurring FIRST cleaning at the regular amount: no frequency discount, frequency still recorded", () => {
    // 2BR/2BA, 1,001–2,000 sq ft, kitchen cabinets + 2 windows, weekly.
    const pricing = calculateAuthoritativePricing(sampleBooking(), FIRST);
    expect(pricing).toEqual({
      baseCleaningPrice: 130,
      bathroomPrice: 20,
      squareFootagePrice: 15,
      cleaningTypePrice: 0,
      extrasPrice: 60,
      subtotal: 225,
      frequencyDiscount: 0,
      totalPrice: 225,
      // 150 bedroom + 60 bathrooms + 15 square footage + 60 extras
      estimatedDurationMinutes: 285,
    });
  });

  it("applies the existing weekly 15% to a qualifying FOLLOW-UP — bedroom base only, same basis as before", () => {
    const pricing = calculateAuthoritativePricing(sampleBooking(), FOLLOW_UP);
    expect(pricing.frequencyDiscount).toBe(19.5); // 130 * 0.15, never the other components
    expect(pricing.totalPrice).toBe(205.5);
    expect(pricing.subtotal).toBe(225);
  });

  it("uses the existing percentage for each recurring frequency on a follow-up (15% / 10% / 5% of the bedroom base)", () => {
    const expected = { weekly: 19.5, biweekly: 13, monthly: 6.5 } as const;
    for (const frequency of ["weekly", "biweekly", "monthly"] as const) {
      const pricing = calculateAuthoritativePricing(sampleBooking({ frequency }), FOLLOW_UP);
      expect(pricing.frequencyDiscount).toBe(expected[frequency]);
    }
  });

  it("gives a one-time booking no frequency discount whether or not a discount is 'applied'", () => {
    const a = calculateAuthoritativePricing(sampleBooking({ frequency: "one-time" }), FIRST);
    const b = calculateAuthoritativePricing(sampleBooking({ frequency: "one-time" }), FOLLOW_UP);
    expect(a.frequencyDiscount).toBe(0);
    expect(b).toEqual(a);
  });

  it("persists each square-footage tier's price and feeds its duration into the authoritative estimate", () => {
    const tiers = [
      { squareFootage: "up-to-1000", price: 0, minutes: 0 },
      { squareFootage: "1001-2000", price: 15, minutes: 15 },
      { squareFootage: "2001-3000", price: 25, minutes: 20 },
      { squareFootage: "3001-4000", price: 35, minutes: 25 },
    ] as const;
    const noExtras = { kitchenCabinets: false, refrigerator: false, oven: false, interiorWindowsQty: 0, blindsQty: 0, noExtras: true };
    const base = calculateAuthoritativePricing(sampleBooking({ squareFootage: "up-to-1000", frequency: "one-time", extras: noExtras }), FIRST);
    for (const tier of tiers) {
      const pricing = calculateAuthoritativePricing(
        sampleBooking({ squareFootage: tier.squareFootage, frequency: "one-time", extras: noExtras }),
        FIRST,
      );
      expect(pricing.squareFootagePrice).toBe(tier.price);
      expect(pricing.totalPrice).toBe(base.totalPrice + tier.price);
      expect(pricing.subtotal).toBe(base.subtotal + tier.price);
      expect(pricing.estimatedDurationMinutes).toBe(base.estimatedDurationMinutes + tier.minutes);
    }
  });

  it("keeps subtotal minus discount consistent with total for every frequency, first cleaning and follow-up alike", () => {
    for (const options of [FIRST, FOLLOW_UP]) {
      for (const frequency of ["one-time", "weekly", "biweekly", "monthly"] as const) {
        const pricing = calculateAuthoritativePricing(sampleBooking({ frequency }), options);
        expect(Math.round((pricing.subtotal - pricing.frequencyDiscount) * 100)).toBe(Math.round(pricing.totalPrice * 100));
      }
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
        ongoingVisitDiscount: 0,
        ongoingVisitTotal: 100,
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
    expect(() => brokenModule.calculateAuthoritativePricing(sampleBooking(), { applyFrequencyDiscount: false })).toThrow(brokenModule.PricingError);
  });
});

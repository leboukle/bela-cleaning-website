import { describe, it, expect } from "vitest";
import { calculateEstimate } from "./calculate";
import {
  BEDROOM_OPTIONS,
  BATHROOM_OPTIONS,
  CLEANING_TYPE_OPTIONS,
  FREQUENCY_OPTIONS,
  SQUARE_FOOTAGE_OPTIONS,
} from "./config";
import {
  FIRST_CLEANING_NOTICE,
  RECURRING_CONSENT_TEXT,
  getQuoteKind,
  getSavedQuoteKind,
  getTotalLabel,
  priceAgreedOccurrence,
  type AgreedSchedulePricing,
} from "./recurringPricing";
import { initialExtrasState } from "./types";

describe("priceAgreedOccurrence stays identical to the centralized estimate", () => {
  const recurring = FREQUENCY_OPTIONS.filter((f) => f.id !== "one-time");
  const bedrooms = BEDROOM_OPTIONS.filter((o) => !o.customEstimate);
  const bathrooms = BATHROOM_OPTIONS.filter((o) => !o.customEstimate);
  const squareFootage = SQUARE_FOOTAGE_OPTIONS.filter((o) => !o.customEstimate);

  it("matches calculateEstimate for every bedroom × bathroom × square-footage × cleaning type × frequency, discounted and not", () => {
    let compared = 0;
    for (const bed of bedrooms) {
      for (const bath of bathrooms) {
        for (const sq of squareFootage) {
          for (const type of CLEANING_TYPE_OPTIONS) {
            for (const freq of recurring) {
              const base = {
                customEstimateTrigger: null,
                bedrooms: bed.id,
                bathrooms: bath.id,
                squareFootage: sq.id,
                cleaningType: type.id,
                extras: { ...initialExtrasState, kitchenCabinets: true, interiorWindowsQty: 2, noExtras: false },
                frequency: freq.id,
              } as const;
              const full = calculateEstimate({ ...base, applyFrequencyDiscount: false })!;
              const discounted = calculateEstimate({ ...base, applyFrequencyDiscount: true })!;
              const agreed: AgreedSchedulePricing = {
                baseCleaningPrice: full.bedroomBasePrice,
                bathroomPrice: full.bathroomAddition,
                squareFootagePrice: full.squareFootageAddition,
                cleaningTypePrice: full.cleaningTypeAddition,
                extrasPrice: full.extrasTotal,
                frequencyRate: freq.discount,
              };
              expect(priceAgreedOccurrence(agreed, false).totalPrice).toBe(full.totalPrice);
              expect(priceAgreedOccurrence(agreed, true).totalPrice).toBe(discounted.totalPrice);
              expect(priceAgreedOccurrence(agreed, true).totalPrice).toBe(full.ongoingVisitTotal);
              compared += 1;
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(50);
  });

  it("applies the discount to the bedroom base only", () => {
    const agreed: AgreedSchedulePricing = {
      baseCleaningPrice: 130,
      bathroomPrice: 20,
      squareFootagePrice: 15,
      cleaningTypePrice: 40,
      extrasPrice: 60,
      frequencyRate: 0.15,
    };
    expect(priceAgreedOccurrence(agreed, false)).toEqual({ subtotal: 265, frequencyDiscount: 0, totalPrice: 265 });
    expect(priceAgreedOccurrence(agreed, true)).toEqual({ subtotal: 265, frequencyDiscount: 19.5, totalPrice: 245.5 });
  });

  it("uses the frequency's rate AS AGREED, not whatever the config says now", () => {
    const agreed: AgreedSchedulePricing = {
      baseCleaningPrice: 130,
      bathroomPrice: 20,
      squareFootagePrice: 15,
      cleaningTypePrice: 0,
      extrasPrice: 0,
      frequencyRate: 0.1, // agreed at 10% even though weekly's configured rate is 15%
    };
    expect(priceAgreedOccurrence(agreed, true).frequencyDiscount).toBe(13);
  });
});

describe("customer-facing quote kinds and copy", () => {
  it("classifies what is quoted for a submission", () => {
    expect(getQuoteKind("one-time")).toBe("one-time");
    expect(getQuoteKind("weekly")).toBe("first-cleaning");
    expect(getQuoteKind(null)).toBe("one-time");
    expect(getTotalLabel("first-cleaning")).toBe("First cleaning total");
    expect(getTotalLabel("one-time")).toBe("Estimated total");
  });

  it("classifies from what was SAVED", () => {
    const policy = "first-visit-full-price-v1";
    expect(getSavedQuoteKind({ frequencyLabel: "One time", pricingPolicy: policy, frequencyDiscount: 0 })).toBe("one-time");
    expect(getSavedQuoteKind({ frequencyLabel: "Weekly", pricingPolicy: policy, frequencyDiscount: 0 })).toBe("first-cleaning");
    expect(getSavedQuoteKind({ frequencyLabel: "Weekly", pricingPolicy: policy, frequencyDiscount: 19.5 })).toBe("follow-up");
    expect(getSavedQuoteKind({ frequencyLabel: "Weekly", pricingPolicy: "", frequencyDiscount: 19.5 })).toBe("follow-up");
    expect(getSavedQuoteKind({ frequencyLabel: "Weekly", pricingPolicy: "", frequencyDiscount: 0 })).toBe("legacy");
  });

  it("states automatic scheduling and per-visit charging, and no longer asks for rebooking", () => {
    expect(FIRST_CLEANING_NOTICE).toContain("charged at the regular price");
    expect(FIRST_CLEANING_NOTICE).toContain("schedule your next cleaning automatically");
    expect(FIRST_CLEANING_NOTICE).toContain("charged to your saved card one hour after it ends");
    expect(FIRST_CLEANING_NOTICE).not.toMatch(/book your next cleaning/i);
    expect(RECURRING_CONSENT_TEXT).toContain("automatically schedule");
    expect(RECURRING_CONSENT_TEXT).toContain("charge my saved card");
    expect(RECURRING_CONSENT_TEXT).toContain("late-cancellation fee");
  });
});

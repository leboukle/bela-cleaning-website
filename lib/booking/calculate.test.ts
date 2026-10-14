import { describe, it, expect } from "vitest";
import { calculateEstimate, type PricingInput } from "./calculate";
import { SQUARE_FOOTAGE_OPTIONS } from "./config";
import { initialExtrasState } from "./types";

function input(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    customEstimateTrigger: null,
    bedrooms: "2",
    bathrooms: "2",
    squareFootage: "1001-2000",
    cleaningType: "standard",
    extras: { ...initialExtrasState, noExtras: true },
    frequency: "one-time",
    ...overrides,
  };
}

function estimate(overrides: Partial<PricingInput> = {}) {
  const result = calculateEstimate(input(overrides));
  if (!result) throw new Error("expected a numeric estimate");
  return result;
}

describe("square-footage price modifier", () => {
  it.each([
    ["up-to-1000", 0],
    ["1001-2000", 15],
    ["2001-3000", 25],
    ["3001-4000", 35],
  ] as const)("%s adds $%i to the total", (squareFootage, expectedAddition) => {
    const baseline = estimate({ squareFootage: "up-to-1000" });
    const result = estimate({ squareFootage });
    expect(result.squareFootageAddition).toBe(expectedAddition);
    expect(result.totalPrice).toBe(baseline.totalPrice + expectedAddition);
  });

  it("contributes nothing while square footage is still unselected", () => {
    const result = estimate({ squareFootage: null });
    expect(result.squareFootageAddition).toBe(0);
    expect(result.squareFootageDurationMinutes).toBe(0);
  });

  it("matches the approved example: 2 BR + 2 BA + Standard + 1,001–2,000 sq ft = $165", () => {
    // $130 bedroom base + $20 bathrooms + $15 square footage + $0 Standard
    expect(estimate().totalPrice).toBe(165);
  });

  it("matches the approved example: the same home as a Deep Cleaning = $265", () => {
    // $130 + $20 + $15 + $100 Deep Cleaning
    expect(estimate({ cleaningType: "deep" }).totalPrice).toBe(265);
  });

  it("never applies the recurring discount to the square-footage addition", () => {
    // Weekly = 15% off the BEDROOM BASE only: 130 * 0.85 = 110.50.
    const weekly = estimate({ frequency: "weekly", squareFootage: "3001-4000", applyFrequencyDiscount: true });
    expect(weekly.discountedBedroomBasePrice).toBe(110.5);
    // 110.50 + 20 bathrooms + 35 square footage, undiscounted.
    expect(weekly.totalPrice).toBe(165.5);

    // Same discount amount regardless of which square-footage tier is chosen.
    const smallWeekly = estimate({ frequency: "weekly", squareFootage: "up-to-1000", applyFrequencyDiscount: true });
    expect(weekly.bedroomBasePrice - weekly.discountedBedroomBasePrice).toBe(
      smallWeekly.bedroomBasePrice - smallWeekly.discountedBedroomBasePrice,
    );
  });

  it("returns no numeric estimate (custom quote) while the >4,000 sq ft trigger is active", () => {
    expect(calculateEstimate(input({ squareFootage: "more-than-4000", customEstimateTrigger: "square-footage" }))).toBeNull();
  });

  it("marks >4,000 sq ft as a custom-quote option with no instant price or duration", () => {
    const option = SQUARE_FOOTAGE_OPTIONS.find((o) => o.id === "more-than-4000");
    expect(option?.customEstimate).toBe(true);
    expect(option?.priceAdd).toBeNull();
    expect(option?.durationMinutes).toBeNull();
  });
});

describe("square-footage duration modifier", () => {
  it.each([
    ["up-to-1000", 0],
    ["1001-2000", 15],
    ["2001-3000", 20],
    ["3001-4000", 25],
  ] as const)("%s adds %i minutes to the estimated duration", (squareFootage, expectedMinutes) => {
    const baseline = estimate({ squareFootage: "up-to-1000" });
    const result = estimate({ squareFootage });
    expect(result.squareFootageDurationMinutes).toBe(expectedMinutes);
    expect(result.totalDurationMinutes).toBe(baseline.totalDurationMinutes + expectedMinutes);
  });

  it("sums with every existing duration component in the single centralized total", () => {
    const result = estimate({
      squareFootage: "2001-3000",
      cleaningType: "deep",
      extras: { ...initialExtrasState, kitchenCabinets: true },
    });
    // 150 (2 BR) + 60 (2 BA) + 20 (sq ft) + 30 (cabinets) + 90 (Deep)
    expect(result.totalDurationMinutes).toBe(350);
  });
});

describe("Standard -> Deep Cleaning switch (notes safeguard)", () => {
  it("changes the total by exactly the existing Deep surcharge ($100), once", () => {
    const standard = estimate({ cleaningType: "standard" });
    const deep = estimate({ cleaningType: "deep" });
    expect(deep.totalPrice - standard.totalPrice).toBe(100);
    expect(deep.cleaningTypeAddition).toBe(100);
  });

  it("changes the duration by exactly the existing Deep duration (90 min), once, preserving every other selection", () => {
    const standard = estimate({ cleaningType: "standard", squareFootage: "2001-3000", frequency: "weekly" });
    const deep = estimate({ cleaningType: "deep", squareFootage: "2001-3000", frequency: "weekly" });
    expect(deep.totalDurationMinutes - standard.totalDurationMinutes).toBe(90);
    expect(deep.squareFootageAddition).toBe(standard.squareFootageAddition);
    expect(deep.bathroomAddition).toBe(standard.bathroomAddition);
    expect(deep.discountedBedroomBasePrice).toBe(standard.discountedBedroomBasePrice);
  });
});

describe("first cleaning at full price (recurring discount policy)", () => {
  it.each([
    ["weekly", 0.15],
    ["biweekly", 0.1],
    ["monthly", 0.05],
  ] as const)("%s: the FIRST cleaning carries no discount, and the existing rate (%s) is unchanged for follow-ups", (frequency, rate) => {
    const first = estimate({ frequency }); // applyFrequencyDiscount omitted -> safe default (none)
    const followUp = estimate({ frequency, applyFrequencyDiscount: true });
    const oneTime = estimate({ frequency: "one-time" });

    expect(first.totalPrice).toBe(oneTime.totalPrice); // full regular price
    expect(first.discountedBedroomBasePrice).toBe(first.bedroomBasePrice);
    // The follow-up gets exactly the existing percentage of the bedroom base.
    expect(followUp.bedroomBasePrice - followUp.discountedBedroomBasePrice).toBeCloseTo(followUp.bedroomBasePrice * rate, 2);
    expect(followUp.totalPrice).toBeLessThan(first.totalPrice);
  });

  it("defaults to NO discount when the flag is omitted, so a forgotten argument can never grant one", () => {
    expect(estimate({ frequency: "weekly" }).totalPrice).toBe(estimate({ frequency: "one-time" }).totalPrice);
    expect(estimate({ frequency: "weekly", applyFrequencyDiscount: false }).totalPrice).toBe(
      estimate({ frequency: "one-time" }).totalPrice,
    );
  });

  it("reports the ongoing (second cleaning onward) amount without changing what THIS appointment costs", () => {
    const first = estimate({ frequency: "weekly" });
    const followUp = estimate({ frequency: "weekly", applyFrequencyDiscount: true });
    expect(first.ongoingVisitTotal).toBe(followUp.totalPrice);
    expect(first.ongoingVisitDiscount).toBe(19.5); // 15% of the $130 bedroom base
    expect(first.totalPrice).toBe(165); // $130 + $20 + $15 — the regular price
    expect(followUp.ongoingVisitTotal).toBe(followUp.totalPrice);
  });

  it("one-time bookings: no discount and no ongoing difference", () => {
    const oneTime = estimate({ frequency: "one-time" });
    expect(oneTime.ongoingVisitDiscount).toBe(0);
    expect(oneTime.ongoingVisitTotal).toBe(oneTime.totalPrice);
    expect(estimate({ frequency: "one-time", applyFrequencyDiscount: true }).totalPrice).toBe(oneTime.totalPrice);
  });
});

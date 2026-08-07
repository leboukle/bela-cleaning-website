// SERVER-ONLY. Authoritative price/duration computation for a validated
// booking (STEPS 9-10). Reuses lib/booking/calculate.ts's calculateEstimate
// — the single approved pricing/duration engine — completely unchanged;
// this module's only job is to (a) shape a ValidatedBooking into that
// function's input, and (b) map its output onto the Bookings sheet's
// separate pricing columns with deterministic rounding at the boundary.
import "server-only";
import { calculateEstimate } from "@/lib/booking/calculate";
import { roundMoney } from "./money";
import type { ValidatedBooking } from "./types";

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

export type AuthoritativePricing = {
  baseCleaningPrice: number;
  bathroomPrice: number;
  cleaningTypePrice: number;
  extrasPrice: number;
  subtotal: number;
  frequencyDiscount: number;
  totalPrice: number;
  estimatedDurationMinutes: number;
};

/**
 * Recalculates price and duration entirely server-side from the validated
 * booking. `customEstimateTrigger` is always null here because
 * validateSubmission.ts already rejects any bedrooms/bathrooms/square
 * footage option flagged `customEstimate` — those properties never reach
 * an instant-priced booking.
 */
export function calculateAuthoritativePricing(booking: ValidatedBooking): AuthoritativePricing {
  const estimate = calculateEstimate({
    customEstimateTrigger: null,
    bedrooms: booking.bedrooms,
    bathrooms: booking.bathrooms,
    cleaningType: booking.cleaningType,
    extras: booking.extras,
    frequency: booking.frequency,
  });

  if (!estimate) {
    throw new PricingError("Unable to compute an instant price for this booking.");
  }

  const baseCleaningPrice = roundMoney(estimate.bedroomBasePrice);
  const bathroomPrice = roundMoney(estimate.bathroomAddition);
  const cleaningTypePrice = roundMoney(estimate.cleaningTypeAddition);
  const extrasPrice = roundMoney(estimate.extrasTotal);
  const subtotal = roundMoney(baseCleaningPrice + bathroomPrice + cleaningTypePrice + extrasPrice);
  const frequencyDiscount = roundMoney(estimate.bedroomBasePrice - estimate.discountedBedroomBasePrice);
  const totalPrice = roundMoney(estimate.totalPrice);

  // Defensive internal consistency check: Subtotal - Discount must equal
  // Total. A mismatch would mean calculate.ts's formula changed in a way
  // this mapping no longer reflects — fail loudly rather than silently
  // writing an inconsistent row.
  if (Math.abs(roundMoney(subtotal - frequencyDiscount) - totalPrice) > 0.005) {
    throw new PricingError("Internal pricing inconsistency detected.");
  }

  return {
    baseCleaningPrice,
    bathroomPrice,
    cleaningTypePrice,
    extrasPrice,
    subtotal,
    frequencyDiscount,
    totalPrice,
    estimatedDurationMinutes: estimate.totalDurationMinutes,
  };
}

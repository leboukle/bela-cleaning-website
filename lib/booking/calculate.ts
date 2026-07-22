// Pure pricing and duration calculation for the booking prototype. No side
// effects, no network calls — this can be unit tested directly and reused
// unchanged if this logic later moves server-side alongside a database.
import {
  BATHROOM_OPTIONS,
  BEDROOM_OPTIONS,
  CLEANING_TYPE_OPTIONS,
  EXTRAS_CONFIG,
  FREQUENCY_OPTIONS,
} from "./config";
import type { BookingState, ExtrasState } from "./types";

export type EstimateBreakdown = {
  bedroomBasePrice: number;
  discountedBedroomBasePrice: number;
  bathroomAddition: number;
  extrasTotal: number;
  cleaningTypeAddition: number;
  totalPrice: number;

  bedroomBaseDurationMinutes: number;
  bathroomDurationMinutes: number;
  extrasDurationMinutes: number;
  cleaningTypeDurationMinutes: number;
  totalDurationMinutes: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function calculateExtrasPrice(extras: ExtrasState): number {
  if (extras.noExtras) return 0;
  let total = 0;
  if (extras.kitchenCabinets) total += EXTRAS_CONFIG.kitchenCabinets.price;
  if (extras.refrigerator) total += EXTRAS_CONFIG.refrigerator.price;
  if (extras.oven) total += EXTRAS_CONFIG.oven.price;
  total += extras.interiorWindowsQty * EXTRAS_CONFIG.interiorWindows.pricePerUnit;
  total += extras.blindsQty * EXTRAS_CONFIG.blinds.pricePerUnit;
  return total;
}

function calculateExtrasDuration(extras: ExtrasState): number {
  if (extras.noExtras) return 0;
  let total = 0;
  if (extras.kitchenCabinets) total += EXTRAS_CONFIG.kitchenCabinets.durationMinutes;
  if (extras.refrigerator) total += EXTRAS_CONFIG.refrigerator.durationMinutes;
  if (extras.oven) total += EXTRAS_CONFIG.oven.durationMinutes;
  total += extras.interiorWindowsQty * EXTRAS_CONFIG.interiorWindows.durationPerUnitMinutes;
  // Blinds intentionally excluded from duration — see the UNRESOLVED
  // BUSINESS RULE note on EXTRAS_CONFIG.blinds.durationPerUnitMinutes.
  return total;
}

/**
 * Computes a running price/duration estimate from whatever has been
 * selected so far. Unselected fields contribute zero, so the summary can
 * display a live total that grows as the customer answers each question.
 *
 * Returns `null` only when a custom-estimate trigger is active
 * (state.customEstimateTrigger !== null) — at that point no numeric
 * estimate should be shown at all.
 *
 * Pricing formula:
 *   discounted bedroom base price
 *   + bathroom addition
 *   + extras
 *   + cleaning-type addition
 *   = estimated total
 *
 * Duration formula:
 *   bedroom base duration
 *   + bathroom additional duration
 *   + extras duration
 *   + cleaning-type additional duration
 *   = estimated duration
 *
 * The frequency discount applies ONLY to the bedroom base price — never to
 * the bathroom addition, extras, or cleaning-type addition.
 */
export function calculateEstimate(state: BookingState): EstimateBreakdown | null {
  if (state.customEstimateTrigger) return null;

  const bedroomOption = state.bedrooms ? BEDROOM_OPTIONS.find((o) => o.id === state.bedrooms) : null;
  const bedroomBasePrice = bedroomOption && !bedroomOption.customEstimate ? (bedroomOption.price ?? 0) : 0;
  const bedroomBaseDurationMinutes =
    bedroomOption && !bedroomOption.customEstimate ? (bedroomOption.durationMinutes ?? 0) : 0;

  const frequencyOption = state.frequency
    ? FREQUENCY_OPTIONS.find((o) => o.id === state.frequency)
    : FREQUENCY_OPTIONS[0]; // default to "One time" (0% discount) until chosen
  const discountRate = frequencyOption?.discount ?? 0;
  const discountedBedroomBasePrice = round2(bedroomBasePrice * (1 - discountRate));

  const bathroomOption = state.bathrooms ? BATHROOM_OPTIONS.find((o) => o.id === state.bathrooms) : null;
  const bathroomAddition = bathroomOption && !bathroomOption.customEstimate ? (bathroomOption.priceAdd ?? 0) : 0;
  const bathroomDurationMinutes =
    bathroomOption && !bathroomOption.customEstimate ? (bathroomOption.durationMinutes ?? 0) : 0;

  const extrasTotal = calculateExtrasPrice(state.extras);
  const extrasDurationMinutes = calculateExtrasDuration(state.extras);

  const cleaningTypeOption = state.cleaningType
    ? CLEANING_TYPE_OPTIONS.find((o) => o.id === state.cleaningType)
    : null;
  const cleaningTypeAddition = cleaningTypeOption?.priceAdd ?? 0;
  const cleaningTypeDurationMinutes = cleaningTypeOption?.durationMinutes ?? 0;

  const totalPrice = round2(discountedBedroomBasePrice + bathroomAddition + extrasTotal + cleaningTypeAddition);
  const totalDurationMinutes =
    bedroomBaseDurationMinutes + bathroomDurationMinutes + extrasDurationMinutes + cleaningTypeDurationMinutes;

  return {
    bedroomBasePrice,
    discountedBedroomBasePrice,
    bathroomAddition,
    extrasTotal,
    cleaningTypeAddition,
    totalPrice,
    bedroomBaseDurationMinutes,
    bathroomDurationMinutes,
    extrasDurationMinutes,
    cleaningTypeDurationMinutes,
    totalDurationMinutes,
  };
}

export function formatCurrency(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

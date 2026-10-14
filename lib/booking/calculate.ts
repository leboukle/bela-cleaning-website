// Pure pricing and duration calculation for the booking prototype. No side
// effects, no network calls — this can be unit tested directly and reused
// unchanged if this logic later moves server-side alongside a database.
import {
  BATHROOM_OPTIONS,
  BEDROOM_OPTIONS,
  CLEANING_TYPE_OPTIONS,
  EXTRAS_CONFIG,
  FREQUENCY_OPTIONS,
  SQUARE_FOOTAGE_OPTIONS,
} from "./config";
import type { BookingState, ExtrasState } from "./types";

// The subset of BookingState this engine actually reads. Narrowed (rather
// than requiring a full BookingState) so the exact same approved function
// can be called both by the client — which naturally has a full
// BookingState — and by the server-side booking pipeline, which only ever
// has the validated pricing-relevant fields and has no reason to
// construct unrelated UI-only ones (stepIndex, propertyType, etc.) just
// to satisfy the type. A full BookingState still structurally satisfies
// this type, so no existing call site needed to change.
export type PricingInput = Pick<
  BookingState,
  "customEstimateTrigger" | "bedrooms" | "bathrooms" | "squareFootage" | "cleaningType" | "extras" | "frequency"
> & {
  /**
   * Whether the selected frequency's discount applies to THIS appointment.
   * First-cleaning-at-full-price policy: false for the first cleaning of a
   * recurring schedule, true only for a qualifying follow-up. The server
   * derives it from authoritative records (followUpEligibility.ts); the
   * browser only mirrors the server's answer for display. Defaults to
   * false so an omitted value can never produce an unearned discount.
   */
  applyFrequencyDiscount?: boolean;
};

export type EstimateBreakdown = {
  bedroomBasePrice: number;
  /** Bedroom base after the discount applied to THIS appointment (== bedroomBasePrice when none applies). */
  discountedBedroomBasePrice: number;
  /**
   * What the frequency's discount is worth per visit once it applies (the
   * second cleaning onward), and the total those visits come to assuming
   * the same cleaning details. 0 / equal to totalPrice for one-time.
   * Informational — never the amount charged for this appointment.
   */
  ongoingVisitDiscount: number;
  ongoingVisitTotal: number;
  bathroomAddition: number;
  squareFootageAddition: number;
  extrasTotal: number;
  cleaningTypeAddition: number;
  totalPrice: number;

  bedroomBaseDurationMinutes: number;
  bathroomDurationMinutes: number;
  squareFootageDurationMinutes: number;
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
 *   + square-footage addition
 *   + extras
 *   + cleaning-type addition
 *   = estimated total
 *
 * Duration formula:
 *   bedroom base duration
 *   + bathroom additional duration
 *   + square-footage additional duration
 *   + extras duration
 *   + cleaning-type additional duration
 *   = estimated duration
 *
 * The frequency discount applies ONLY to the bedroom base price — never to
 * the bathroom addition, square-footage addition, extras, or cleaning-type
 * addition. It is applied to this estimate only when
 * `applyFrequencyDiscount` is true (a qualifying follow-up cleaning); the
 * first cleaning of a recurring schedule is priced at the regular amount,
 * and `ongoingVisitTotal` reports what later visits will cost.
 */
export function calculateEstimate(state: PricingInput): EstimateBreakdown | null {
  if (state.customEstimateTrigger) return null;

  const bedroomOption = state.bedrooms ? BEDROOM_OPTIONS.find((o) => o.id === state.bedrooms) : null;
  const bedroomBasePrice = bedroomOption && !bedroomOption.customEstimate ? (bedroomOption.price ?? 0) : 0;
  const bedroomBaseDurationMinutes =
    bedroomOption && !bedroomOption.customEstimate ? (bedroomOption.durationMinutes ?? 0) : 0;

  const frequencyOption = state.frequency
    ? FREQUENCY_OPTIONS.find((o) => o.id === state.frequency)
    : FREQUENCY_OPTIONS[0]; // default to "One time" (0% discount) until chosen
  const discountRate = frequencyOption?.discount ?? 0;
  // The frequency's rate and its basis (the bedroom base) are unchanged;
  // only WHETHER it applies to this appointment is now an explicit input.
  const appliedRate = state.applyFrequencyDiscount === true ? discountRate : 0;
  const discountedBedroomBasePrice = round2(bedroomBasePrice * (1 - appliedRate));
  const ongoingDiscountedBedroomBase = round2(bedroomBasePrice * (1 - discountRate));

  const bathroomOption = state.bathrooms ? BATHROOM_OPTIONS.find((o) => o.id === state.bathrooms) : null;
  const bathroomAddition = bathroomOption && !bathroomOption.customEstimate ? (bathroomOption.priceAdd ?? 0) : 0;
  const bathroomDurationMinutes =
    bathroomOption && !bathroomOption.customEstimate ? (bathroomOption.durationMinutes ?? 0) : 0;

  const squareFootageOption = state.squareFootage
    ? SQUARE_FOOTAGE_OPTIONS.find((o) => o.id === state.squareFootage)
    : null;
  const squareFootageAddition =
    squareFootageOption && !squareFootageOption.customEstimate ? (squareFootageOption.priceAdd ?? 0) : 0;
  const squareFootageDurationMinutes =
    squareFootageOption && !squareFootageOption.customEstimate ? (squareFootageOption.durationMinutes ?? 0) : 0;

  const extrasTotal = calculateExtrasPrice(state.extras);
  const extrasDurationMinutes = calculateExtrasDuration(state.extras);

  const cleaningTypeOption = state.cleaningType
    ? CLEANING_TYPE_OPTIONS.find((o) => o.id === state.cleaningType)
    : null;
  const cleaningTypeAddition = cleaningTypeOption?.priceAdd ?? 0;
  const cleaningTypeDurationMinutes = cleaningTypeOption?.durationMinutes ?? 0;

  const nonBedroomTotal = bathroomAddition + squareFootageAddition + extrasTotal + cleaningTypeAddition;
  const totalPrice = round2(discountedBedroomBasePrice + nonBedroomTotal);
  const ongoingVisitTotal = round2(ongoingDiscountedBedroomBase + nonBedroomTotal);
  const ongoingVisitDiscount = round2(bedroomBasePrice - ongoingDiscountedBedroomBase);
  const totalDurationMinutes =
    bedroomBaseDurationMinutes +
    bathroomDurationMinutes +
    squareFootageDurationMinutes +
    extrasDurationMinutes +
    cleaningTypeDurationMinutes;

  return {
    bedroomBasePrice,
    discountedBedroomBasePrice,
    ongoingVisitDiscount,
    ongoingVisitTotal,
    bathroomAddition,
    squareFootageAddition,
    extrasTotal,
    cleaningTypeAddition,
    totalPrice,
    bedroomBaseDurationMinutes,
    bathroomDurationMinutes,
    squareFootageDurationMinutes,
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

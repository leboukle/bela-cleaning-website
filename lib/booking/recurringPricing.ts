// Recurring-schedule pricing vocabulary and customer-facing copy (client-safe).
//
// Rule for recurring schedules: the FIRST PERFORMED cleaning is charged at
// the regular price (no frequency discount); every appointment generated
// after at least one cleaning has actually been performed receives the
// selected frequency's existing discount. The discount percentages and the
// basis they apply to (the bedroom base price) live unchanged in config.ts
// / calculate.ts — this module adds only the schedule pricing helper (so a
// generated appointment is priced from the schedule's agreed snapshot, never
// from later configuration) and the customer-facing wording, so UI and
// emails never re-derive either.
//
// Whether a generated appointment is discounted is decided exclusively on
// the server (lib/booking/server/recurringScheduleService.ts) from stored
// completion records. Nothing the browser sends can grant it.
import { getFrequencyOption } from "./config";
import type { FrequencyId } from "./types";

/**
 * Stamped into the "Pricing Policy" column of every booking created under
 * the recurring-schedule pricing rule. A blank value means the booking
 * pre-dates it and was priced under the previous policy (discount from the
 * first booking, no schedule); such rows are never repriced.
 */
export const FIRST_VISIT_PRICING_POLICY = "first-visit-full-price-v1";

/** Version of the consent wording the customer agreed to; stored on the schedule. */
export const RECURRING_CONSENT_VERSION = "recurring-consent-v2";

export function isRecurringFrequency(frequency: FrequencyId | null | undefined): boolean {
  return Boolean(frequency) && frequency !== "one-time";
}

/**
 * What the amount currently being quoted (or saved) represents.
 *  - "first-cleaning": a recurring schedule's initial appointment, at regular price.
 *  - "follow-up": a generated recurring appointment that received the discount.
 *  - "legacy": a recurring-labelled booking saved before schedules existed,
 *    with no discount recorded — makes no first-cleaning or discount claim.
 */
export type QuoteKind = "one-time" | "first-cleaning" | "follow-up" | "legacy";

export function getQuoteKind(frequency: FrequencyId | null | undefined): QuoteKind {
  return isRecurringFrequency(frequency) ? "first-cleaning" : "one-time";
}

/**
 * Classification derived from what was actually SAVED for a booking (its
 * frequency label, pricing policy and frequency discount) rather than from
 * browser state. Confirmation page and emails use this so they always
 * describe the saved booking.
 */
export function getSavedQuoteKind(saved: {
  frequencyLabel: string;
  pricingPolicy: string;
  frequencyDiscount: number;
}): QuoteKind {
  if (saved.frequencyLabel === getFrequencyOption("one-time").label) return "one-time";
  if (saved.frequencyDiscount > 0) return "follow-up";
  return saved.pricingPolicy === FIRST_VISIT_PRICING_POLICY ? "first-cleaning" : "legacy";
}

/** Label for the amount charged for THE APPOINTMENT BEING BOOKED. */
export function getTotalLabel(kind: QuoteKind): string {
  return kind === "first-cleaning" ? "First cleaning total" : "Estimated total";
}

/**
 * The explicit statement of the recurring arrangement, shown ONLY for an
 * initial recurring booking (never for a generated appointment that
 * already carries its discount).
 */
export const FIRST_CLEANING_NOTICE =
  "Your first cleaning is charged at the regular price. After it is completed, we schedule your next cleaning automatically and apply your recurring discount to it and to every later cleaning. Each cleaning is charged to your saved card one hour after it ends.";

/**
 * What a recurring customer can do afterwards; shown beside the notice.
 * Two DIFFERENT actions: cancelling one cleaning keeps the schedule going;
 * stopping ends the schedule (no fee for stopping itself).
 */
export const RECURRING_CONTROLS_NOTICE =
  "In Manage Booking you can cancel one cleaning (your recurring cleanings continue) or stop recurring cleanings (no more cleanings are scheduled). Stopping itself has no fee; a cleaning cancelled within 24 hours of its start time is subject to the late-cancellation fee.";

/**
 * The consent the customer must give to book a recurring schedule. The
 * wording version is stored with the schedule (RECURRING_CONSENT_VERSION).
 */
export const RECURRING_CONSENT_TEXT =
  "I authorize BeLa Cleaning to automatically schedule my recurring cleanings and to charge my saved card for each cleaning one hour after it ends, in the amount shown for that cleaning. I understand that cancelling one cleaning keeps my recurring schedule going, that stopping recurring cleanings ends the schedule with no fee for stopping, and that any cleaning cancelled within 24 hours of its start time is subject to the late-cancellation fee of 50% of its total.";

/** "Weekly" -> "weekly", "Every other week" -> "every other week". */
function frequencyPhrase(frequency: FrequencyId): string {
  return getFrequencyOption(frequency).label.toLowerCase();
}

export function followUpAppliedNotice(frequency: FrequencyId): string {
  return `Your ${frequencyPhrase(frequency)} discount is applied to this cleaning.`;
}

/** Same sentence for places that only have the persisted label ("Weekly"). */
export function followUpAppliedNoticeForLabel(frequencyLabel: string): string {
  return `Your ${frequencyLabel.toLowerCase()} discount is applied to this cleaning.`;
}

// ---------------------------------------------------------------------------
// Agreed schedule pricing
// ---------------------------------------------------------------------------

/**
 * The price components agreed when the schedule was created, plus the
 * frequency's discount rate AT THAT TIME. Generated appointments are priced
 * from this snapshot — a later change to the price list or discount config
 * never silently reprices an existing schedule.
 */
export type AgreedSchedulePricing = {
  baseCleaningPrice: number;
  bathroomPrice: number;
  squareFootagePrice: number;
  cleaningTypePrice: number;
  extrasPrice: number;
  /** e.g. 0.15 for weekly. */
  frequencyRate: number;
};

export type PricedOccurrence = {
  subtotal: number;
  frequencyDiscount: number;
  totalPrice: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Same formula and rounding as calculateEstimate (calculate.ts): the
 * frequency discount applies only to the bedroom base price, never to the
 * bathroom, square-footage, cleaning-type or extras amounts. When the
 * discount does not apply (the first performed cleaning) the total equals
 * the subtotal.
 */
export function priceAgreedOccurrence(agreed: AgreedSchedulePricing, applyFrequencyDiscount: boolean): PricedOccurrence {
  const appliedRate = applyFrequencyDiscount ? agreed.frequencyRate : 0;
  const discountedBase = round2(agreed.baseCleaningPrice * (1 - appliedRate));
  const nonBase = agreed.bathroomPrice + agreed.squareFootagePrice + agreed.cleaningTypePrice + agreed.extrasPrice;
  return {
    subtotal: round2(agreed.baseCleaningPrice + nonBase),
    frequencyDiscount: round2(agreed.baseCleaningPrice - discountedBase),
    totalPrice: round2(discountedBase + nonBase),
  };
}

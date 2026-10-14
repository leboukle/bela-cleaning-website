// First-cleaning-at-full-price policy: shared, client-safe definitions.
//
// Rule for recurring schedules created under this policy: the FIRST
// cleaning is charged at the regular price (no frequency discount); the
// second and subsequent cleanings receive the selected frequency's
// existing discount. The discount percentages themselves, and the basis
// they apply to (the bedroom base price), live unchanged in config.ts /
// calculate.ts — this module adds only the eligibility vocabulary and the
// customer-facing copy, so UI and emails never re-derive either.
//
// IMPORTANT: whether a particular booking actually qualifies for the
// discount is decided exclusively on the server (see
// lib/booking/server/followUpEligibility.ts). Nothing in this file, and
// nothing the browser sends, can grant it.
import { getFrequencyOption } from "./config";
import type { FrequencyId } from "./types";

/**
 * Stamped into the "Pricing Policy" column of every booking created under
 * this rule. A blank value means the booking pre-dates the rule and was
 * priced under the previous policy (discount from the first booking);
 * such rows are never repriced.
 */
export const FIRST_VISIT_PRICING_POLICY = "first-visit-full-price-v1";

export function isRecurringFrequency(frequency: FrequencyId | null | undefined): boolean {
  return Boolean(frequency) && frequency !== "one-time";
}

/**
 * What the amount currently being quoted (or saved) represents.
 *  - "first-cleaning": a recurring schedule's initial visit, at regular price.
 *  - "follow-up": a recurring visit that received the frequency discount.
 *  - "legacy": a recurring booking saved before this policy with no
 *    discount recorded — makes no first-cleaning or discount claim.
 */
export type QuoteKind = "one-time" | "first-cleaning" | "follow-up" | "legacy";

export function getQuoteKind(frequency: FrequencyId | null | undefined, discountApplied: boolean): QuoteKind {
  if (!isRecurringFrequency(frequency)) return "one-time";
  return discountApplied ? "follow-up" : "first-cleaning";
}

/**
 * Same classification, derived from what was actually SAVED for a booking
 * (its frequency label, pricing policy and frequency discount) rather than
 * from browser state. Confirmation page and emails use this so they always
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
 * The one explicit statement of the policy, shown ONLY for an initial
 * recurring booking (never for a follow-up that already has its discount).
 */
export const FIRST_CLEANING_NOTICE =
  "Your first cleaning is charged at the regular price. After it is completed, use ‘Book your next cleaning’ in Manage Booking to receive your recurring discount. Future visits are booked separately.";

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

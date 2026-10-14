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

/** What the amount currently being quoted represents. */
export type QuoteKind = "one-time" | "first-cleaning" | "follow-up";

export function getQuoteKind(frequency: FrequencyId | null | undefined, discountApplied: boolean): QuoteKind {
  if (!isRecurringFrequency(frequency)) return "one-time";
  return discountApplied ? "follow-up" : "first-cleaning";
}

/** Label for the amount charged for THE APPOINTMENT BEING BOOKED. */
export function getTotalLabel(kind: QuoteKind): string {
  return kind === "first-cleaning" ? "First cleaning total" : "Estimated total";
}

/** "Weekly" -> "weekly", "Every other week" -> "every other week". */
function frequencyPhrase(frequency: FrequencyId): string {
  return getFrequencyOption(frequency).label.toLowerCase();
}

/** Same sentence, for places that only have the persisted label ("Weekly"). */
export function firstCleaningNoticeForLabel(frequencyLabel: string): string {
  return `Your first cleaning is charged at the regular price. Your ${frequencyLabel.toLowerCase()} discount starts with your second cleaning.`;
}

export function firstCleaningNotice(frequency: FrequencyId): string {
  return firstCleaningNoticeForLabel(getFrequencyOption(frequency).label);
}

export function followUpAppliedNotice(frequency: FrequencyId): string {
  return `Your ${frequencyPhrase(frequency)} discount is applied to this cleaning.`;
}

/** Explains how to get the discount on the next visit; used in the confirmation page/email. */
export const BOOK_NEXT_CLEANING_INSTRUCTION =
  "After your first cleaning is completed, open your Manage Booking link and choose “Book your next cleaning” to receive your discount.";

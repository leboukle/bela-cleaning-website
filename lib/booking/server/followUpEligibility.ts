// SERVER-ONLY. The single authority on whether a booking earns its
// recurring-frequency discount under the first-cleaning-at-full-price
// policy (see lib/booking/recurringPricing.ts).
//
// Frequency on its own is only a label — this app creates no linked
// recurring appointments, and every submission is a standalone booking —
// so eligibility cannot be inferred. The ONLY authoritative link is the
// customer's own secret Manage Booking token for an earlier booking
// (256-bit, stored only as a hash — the same trust model as Manage
// Booking itself). That token resolves to the earlier booking's record,
// and its saved state (Booking Status, Completed At — set only by BeLa's
// explicit internal "Mark complete" action) is what qualifies a follow-up.
//
// Deliberately NOT used: the customer's email, address, phone, or any
// booking history. A returning customer who starts a NEW recurring
// schedule (no link) is correctly treated as a first cleaning.
import "server-only";
import { BOOKING_STATUS } from "./bookingsSheetSchema";
import { hashManageToken, isPlausibleManageToken } from "./manageToken";
import { getFrequencyOption } from "@/lib/booking/config";
import type { BookingRepository } from "./repository";
import type { BookingRecord } from "./types";

export type FollowUpIneligibleReason =
  | "no-link"
  | "invalid-link"
  | "earlier-booking-cancelled"
  | "earlier-booking-not-recurring"
  | "first-cleaning-not-completed";

export type FollowUpEligibility =
  | {
      eligible: true;
      /** The schedule this follow-up continues (the initial booking's ID). */
      scheduleId: string;
      /**
       * "completed-first-cleaning": the earlier booking was created under
       * this policy and BeLa has confirmed it completed.
       * "existing-schedule": the earlier booking pre-dates the policy
       * (blank Pricing Policy) and keeps its original pricing policy —
       * its schedule continues to receive the discount.
       */
      basis: "completed-first-cleaning" | "existing-schedule";
    }
  | { eligible: false; reason: FollowUpIneligibleReason };

/** Pure decision over an already-loaded earlier booking. Exported for direct unit testing. */
export function evaluateFollowUpEligibility(earlier: BookingRecord): FollowUpEligibility {
  if (earlier.bookingStatus === BOOKING_STATUS.CANCELLED) {
    return { eligible: false, reason: "earlier-booking-cancelled" };
  }
  if (earlier.frequency === getFrequencyOption("one-time").label) {
    return { eligible: false, reason: "earlier-booking-not-recurring" };
  }

  // Pre-policy booking: leave its schedule under its existing policy.
  if (earlier.pricingPolicy === "") {
    return { eligible: true, scheduleId: earlier.recurringScheduleId || earlier.bookingId, basis: "existing-schedule" };
  }

  // Created under the policy: the earlier cleaning must actually have been
  // performed — confirmed by BeLa (Completed At), not merely scheduled,
  // not merely paid.
  if (!earlier.completedAt) {
    return { eligible: false, reason: "first-cleaning-not-completed" };
  }
  return { eligible: true, scheduleId: earlier.recurringScheduleId || earlier.bookingId, basis: "completed-first-cleaning" };
}

/**
 * Resolves a follow-up token to an eligibility decision. Never throws for
 * "not eligible" outcomes; repository failures propagate so callers can
 * fail the request rather than silently mis-pricing it.
 */
export async function resolveFollowUpEligibility(
  followUpToken: string | null | undefined,
  repository: Pick<BookingRepository, "findBookingIdByManageTokenHash" | "getFullBookingRecord">,
): Promise<FollowUpEligibility> {
  const token = (followUpToken ?? "").trim();
  if (!token) return { eligible: false, reason: "no-link" };
  if (!isPlausibleManageToken(token)) return { eligible: false, reason: "invalid-link" };

  const bookingId = await repository.findBookingIdByManageTokenHash(hashManageToken(token));
  if (!bookingId) return { eligible: false, reason: "invalid-link" };

  const earlier = await repository.getFullBookingRecord(bookingId);
  if (!earlier) return { eligible: false, reason: "invalid-link" };

  return evaluateFollowUpEligibility(earlier);
}

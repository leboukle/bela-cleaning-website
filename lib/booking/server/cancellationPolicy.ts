// SERVER-ONLY. The single, authoritative >24h/<=24h boundary rule shared
// by cancellation (free vs. late-fee) and rescheduling (allowed vs.
// disabled) — Milestone 6's non-negotiable business rule uses the exact
// same cutoff for both, so this is the one place that rule is expressed.
// Never computed client-side; the browser's clock is never trusted for
// this decision. Works identically for exact-time and legacy
// arrival-window bookings via resolveRecordStartSpec (Milestone 6
// amendment) — this module has no branching of its own for the two kinds.
import "server-only";
import { calculateServiceStart, resolveRecordStartSpec } from "./serviceTime";

// Inclusive on the "late" side per the approved spec: a booking exactly
// 24 hours out is late, not free. 24h + 1 minute out is free.
const LATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const LATE_CANCELLATION_FEE_RATE = 0.5;

export class CancellationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CancellationPolicyError";
  }
}

export type BookingTimingStatus = {
  scheduledStart: Date;
  millisecondsUntilStart: number;
  /** True = more than 24h remaining -> free cancellation / self-service reschedule allowed. */
  isMoreThan24HoursOut: boolean;
};

/**
 * `serviceStartTime`/`arrivalWindow` are the record's own fields exactly
 * as stored — this is the one place that resolves which of the two is
 * authoritative for a given row (see resolveRecordStartSpec), so every
 * caller can just pass both fields straight from the record.
 */
export function getBookingTimingStatus(
  serviceDateKey: string,
  serviceStartTime: string,
  arrivalWindow: string,
  timezone: string,
  now: Date = new Date(),
): BookingTimingStatus {
  let startSpec;
  try {
    startSpec = resolveRecordStartSpec({ serviceStartTime, arrivalWindow });
  } catch (error) {
    throw new CancellationPolicyError(error instanceof Error ? error.message : "Unable to resolve booking start time.");
  }

  const scheduledStart = calculateServiceStart(serviceDateKey, startSpec, timezone);
  const millisecondsUntilStart = scheduledStart.getTime() - now.getTime();

  return {
    scheduledStart,
    millisecondsUntilStart,
    isMoreThan24HoursOut: millisecondsUntilStart > LATE_WINDOW_MS,
  };
}

/** 50% of the authoritative charge amount (dollars), rounded to the nearest cent. */
export function calculateLateCancellationFeeCents(chargeAmountDollars: number): number {
  return Math.round(chargeAmountDollars * 100 * LATE_CANCELLATION_FEE_RATE);
}

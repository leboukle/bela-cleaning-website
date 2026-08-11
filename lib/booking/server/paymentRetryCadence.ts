// SERVER-ONLY. The approved failed-payment retry cadence — a single
// source of truth so the schedule can't drift between where it's computed
// and where it's documented. See docs/payments.md's retry policy section.
//
// Attempt 1 is the original attempt at Scheduled Charge At (not a
// "retry"). If it fails and is classified retryable, the next attempts
// follow this table; after the last one fails, the booking moves to
// Final Failure.
import "server-only";

const RETRY_DELAYS_MS = [
  6 * 60 * 60 * 1000, // attempt 2: +6 hours
  24 * 60 * 60 * 1000, // attempt 3: +24 hours
  72 * 60 * 60 * 1000, // attempt 4: +72 hours
];

export const MAX_PAYMENT_ATTEMPTS = RETRY_DELAYS_MS.length + 1; // 4

/**
 * Given the attempt number that just failed (1-indexed) and the time it
 * failed, returns the next attempt's due time, or `null` if that was the
 * final allowed attempt (caller should move to Final Failure instead).
 */
export function getNextRetryAt(failedAttemptNumber: number, failedAt: Date): Date | null {
  const delay = RETRY_DELAYS_MS[failedAttemptNumber - 1];
  if (delay === undefined) return null;
  return new Date(failedAt.getTime() + delay);
}

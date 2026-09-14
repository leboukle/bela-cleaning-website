// SERVER-ONLY. Computes a new assignment's response deadline from the
// approved tiered short-notice rule (Milestone 7 architecture decision):
//
//   - Offered more than 48h before service start -> 24h response window.
//   - Offered between 24h and 48h before service start -> 12h response window.
//   - Offered less than 24h before service start -> automated assignment
//     creation is BLOCKED (returns a rejection, not a clamped deadline) —
//     never create an assignment whose response window could leave BeLa
//     with inadequate time to recover before the appointment.
//
// Deliberately pure/synchronous — assignmentService.ts is the only
// caller, and always passes already-resolved Date instants (never
// re-derives timezone/DST itself here, matching reminderService.ts's
// "pure millisecond arithmetic on already-absolute instants" convention).
import "server-only";

const HOUR_MS = 60 * 60 * 1000;
export const SHORT_NOTICE_BLOCK_THRESHOLD_HOURS = 24;
export const MEDIUM_NOTICE_THRESHOLD_HOURS = 48;
export const STANDARD_RESPONSE_WINDOW_HOURS = 24;
export const MEDIUM_NOTICE_RESPONSE_WINDOW_HOURS = 12;

export type DeadlineResult =
  | { ok: true; responseDeadline: Date }
  | { ok: false; reason: "too-close-to-service-start"; hoursUntilServiceStart: number };

/**
 * `offeredAt` and `serviceStartAt` must both already be real, absolute
 * instants (serviceStartAt: see serviceTime.ts's resolveRecordStartSpec /
 * reminderService.ts's deriveServiceStartAt for how callers get this).
 */
export function computeAssignmentResponseDeadline(offeredAt: Date, serviceStartAt: Date): DeadlineResult {
  const hoursUntilServiceStart = (serviceStartAt.getTime() - offeredAt.getTime()) / HOUR_MS;

  if (hoursUntilServiceStart < SHORT_NOTICE_BLOCK_THRESHOLD_HOURS) {
    return { ok: false, reason: "too-close-to-service-start", hoursUntilServiceStart };
  }

  // "More than 48 hours" (strict) gets the 24h window; exactly 48h falls
  // into the "between 24 and 48" bucket, same as exactly 24h falls into
  // that bucket rather than the blocked one above (that check is a
  // strict "<", not "<="). Both boundaries are inclusive on their lower
  // side, matching the approved rule's own wording.
  const windowHours = hoursUntilServiceStart > MEDIUM_NOTICE_THRESHOLD_HOURS ? STANDARD_RESPONSE_WINDOW_HOURS : MEDIUM_NOTICE_RESPONSE_WINDOW_HOURS;

  return { ok: true, responseDeadline: new Date(offeredAt.getTime() + windowHours * HOUR_MS) };
}

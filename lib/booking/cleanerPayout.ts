// Pure, environment-agnostic (deliberately NOT "server-only") payout
// arithmetic — the one place this formula, and BeLa's standard cleaner
// compensation rate, are defined. Imported by both the authoritative
// server-side assignment-creation flow (assignmentService.ts, which
// snapshots the result onto the Cleaner Assignments row) and the internal
// assignment page's client-side payout preview, so the UI never
// reimplements or drifts from the real calculation; the server always
// recomputes and snapshots its own result on submit and never trusts
// anything the client displayed.
//
// Standing business rule: every cleaner is paid the same flat 60% of the
// cleaning total — this is not per-cleaner configuration, so it is not
// stored on the Cleaners sheet at all (see cleanerSheetSchema.ts). If
// BeLa ever needs true per-cleaner variability, that's a real schema
// change (re-adding a rate column and threading it back through
// createAssignment) — not something to speculatively support today.
export const STANDARD_CLEANER_PAYOUT_PERCENTAGE = 0.6;

// Same cents-based rounding approach as lib/booking/server/money.ts
// (integers round-trip exactly in IEEE-754; arbitrary decimals don't) —
// duplicated as two lines rather than imported, since money.ts is
// server-only and this module must also run in the browser.
export function calculatePayoutAmount(cleaningTotal: number): number {
  const cents = Math.round(cleaningTotal * STANDARD_CLEANER_PAYOUT_PERCENTAGE * 100);
  return cents / 100;
}

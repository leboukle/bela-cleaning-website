// SERVER-ONLY. Deterministic money representation for the persistence
// boundary (STEP 9).
//
// The approved pricing formula itself lives — unchanged — in
// lib/booking/calculate.ts, which this module deliberately does not
// duplicate; calculateEstimate() already rounds every dollar figure to 2
// decimal places via its own round2() helper. What this module adds is a
// second, independent rounding pass at the exact moment a price is about
// to be persisted: every dollar amount is converted to integer CENTS
// (Math.round(dollars * 100)) and back to a 2-decimal number
// (cents / 100), which guarantees the value written to the sheet is
// exactly representable and can never carry silent floating-point drift
// (e.g. 19.999999999998) from repeated arithmetic upstream. Integers are
// used for the conversion specifically because IEEE-754 doubles represent
// small integers exactly, unlike arbitrary decimals.
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

/** Rounds a dollar amount to a safe, persistence-ready 2-decimal number. */
export function roundMoney(dollars: number): number {
  return centsToDollars(toCents(dollars));
}

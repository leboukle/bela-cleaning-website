// Client-safe, code-level service closures: ranges of SERVICE dates (yyyy-mm-dd,
// America/New_York calendar dates — the same keys the Sheet, the calendar and
// the server all use) on which no new appointment can be created.
//
// This is deliberately NOT a second availability system. It is consulted from
// inside the existing availability functions (server/availability.ts) and
// the shared calendar rule (schedule.ts isDateSelectable), so the calendar,
// start times, booking submission, customer rescheduling and recurring
// generation all see it through the one path they already use. The Blackout
// Dates tab stays the owner's day-to-day tool; this only guarantees a
// publicly announced closure cannot depend on a Sheet cell being typed in the
// exact format the reader expects.
//
// Closed dates are inclusive on both ends. Dates outside every range follow
// the normal availability rules unchanged.
export type ServiceClosure = { start: string; end: string };

export const SERVICE_CLOSURES: readonly ServiceClosure[] = [{ start: "2026-10-22", end: "2026-12-31" }];

// Customer-facing wording for a date that cannot be booked. Deliberately
// neutral: it never says why, and never implies the business is closed.
export const DATE_UNAVAILABLE_MESSAGE = "This date is unavailable. Please choose another date.";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isServiceDateClosed(dateKey: string): boolean {
  if (!DATE_KEY.test(dateKey)) return false;
  return SERVICE_CLOSURES.some((c) => dateKey >= c.start && dateKey <= c.end);
}

function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Every closed date key within [startDateKey, endDateKey], inclusive. */
export function getClosedDateKeysInWindow(startDateKey: string, endDateKey: string): string[] {
  const keys: string[] = [];
  for (const closure of SERVICE_CLOSURES) {
    const from = closure.start > startDateKey ? closure.start : startDateKey;
    const to = closure.end < endDateKey ? closure.end : endDateKey;
    for (let key = from; key <= to; key = addDaysToKey(key, 1)) keys.push(key);
  }
  return keys;
}

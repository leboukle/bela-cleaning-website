// SERVER-ONLY. Best-effort, per-warm-instance fast path for duplicate
// submissions (STEP 15).
//
// HONEST LIMITATION: this in-memory cache only helps when two requests
// with the same idempotency token land on the *same* warm serverless
// instance — it does not coordinate across instances and is cleared on
// cold start. It exists purely to short-circuit the most common real case
// (an impatient double-click firing two near-simultaneous requests) so
// the second one doesn't even attempt a second Sheets append.
//
// The AUTHORITATIVE, cross-instance duplicate check is
// GoogleSheetsBookingRepository.findRecentBookingByIdempotencyToken(),
// which bookingService.ts consults regardless of whether this fast path
// hits. See docs/booking-backend.md for the full idempotency strategy and
// its known race-condition boundary.
import "server-only";

const CACHE_TTL_MS = 5 * 60_000;

type CacheEntry<T> = { result: T; expiresAt: number };

const resultCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

// Only a *successful* result is cached beyond the in-flight window — a
// transient failure (e.g. a momentary Sheets API error) must not get
// "stuck" and replayed to a legitimate retry once the underlying problem
// clears. Concurrent simultaneous requests (e.g. a double-click) still
// share the same in-flight promise regardless of outcome, which is what
// actually matters for preventing a duplicate append.
export async function withIdempotencyFastPath<T extends { ok: boolean }>(
  token: string,
  produce: () => Promise<T>,
): Promise<T> {
  const cached = resultCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result as T;
  }

  const inFlight = inFlightRequests.get(token);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const promise = produce()
    .then((result) => {
      inFlightRequests.delete(token);
      if (result.ok) {
        resultCache.set(token, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      }
      return result;
    })
    .catch((error: unknown) => {
      inFlightRequests.delete(token);
      throw error;
    });

  inFlightRequests.set(token, promise);
  return promise;
}

/** Test-only: clears both caches between test cases. */
export function resetIdempotencyFastPathForTests(): void {
  resultCache.clear();
  inFlightRequests.clear();
}

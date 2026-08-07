// SERVER-ONLY. Lightweight, in-memory, best-effort throttle (STEP 16).
//
// HONEST LIMITATION: serverless function instances do not share memory,
// so this only limits requests that land on the same warm instance — it
// is not a substitute for a real rate-limiting service. No paid or
// additional persistent external service is introduced for this
// milestone, per the project rules, so this is the proportionate defense
// available: it works alongside the honeypot field as defense in depth,
// not as a hard guarantee.
import "server-only";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

/** Returns true if `key` (e.g. a client IP) has exceeded the window limit. */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return false;
  }

  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

/** Test-only: clears all buckets between test cases. */
export function resetRateLimitForTests(): void {
  buckets.clear();
}

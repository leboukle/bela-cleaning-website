import { describe, it, expect } from "vitest";
import { getNextRetryAt, MAX_PAYMENT_ATTEMPTS } from "./paymentRetryCadence";

describe("paymentRetryCadence", () => {
  it("MAX_PAYMENT_ATTEMPTS is 4 (1 original + 3 retries)", () => {
    expect(MAX_PAYMENT_ATTEMPTS).toBe(4);
  });

  it("schedules the 2nd attempt 6 hours after the 1st attempt fails", () => {
    const failedAt = new Date("2026-02-15T13:00:00.000Z");
    const next = getNextRetryAt(1, failedAt);
    expect(next?.toISOString()).toBe("2026-02-15T19:00:00.000Z");
  });

  it("schedules the 3rd attempt 24 hours after the 2nd attempt fails", () => {
    const failedAt = new Date("2026-02-15T19:00:00.000Z");
    const next = getNextRetryAt(2, failedAt);
    expect(next?.toISOString()).toBe("2026-02-16T19:00:00.000Z");
  });

  it("schedules the 4th attempt 72 hours after the 3rd attempt fails", () => {
    const failedAt = new Date("2026-02-16T19:00:00.000Z");
    const next = getNextRetryAt(3, failedAt);
    expect(next?.toISOString()).toBe("2026-02-19T19:00:00.000Z");
  });

  it("returns null after the 4th (final) attempt fails — no further retries", () => {
    const failedAt = new Date("2026-02-19T19:00:00.000Z");
    expect(getNextRetryAt(4, failedAt)).toBeNull();
  });
});

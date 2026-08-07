import { describe, it, expect, vi, beforeEach } from "vitest";
import { isRateLimited, resetRateLimitForTests } from "./rateLimit";

beforeEach(() => {
  resetRateLimitForTests();
});

describe("isRateLimited", () => {
  it("allows up to 5 requests within the window", () => {
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited("client-a")).toBe(false);
    }
  });

  it("blocks the 6th request within the same window", () => {
    for (let i = 0; i < 5; i++) isRateLimited("client-b");
    expect(isRateLimited("client-b")).toBe(true);
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 5; i++) isRateLimited("client-c");
    expect(isRateLimited("client-d")).toBe(false);
  });

  it("resets once the window elapses", () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) isRateLimited("client-e");
      expect(isRateLimited("client-e")).toBe(true);
      vi.advanceTimersByTime(61_000);
      expect(isRateLimited("client-e")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

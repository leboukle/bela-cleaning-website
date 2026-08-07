import { describe, it, expect, vi, beforeEach } from "vitest";
import { withIdempotencyFastPath, resetIdempotencyFastPathForTests } from "./idempotency";

beforeEach(() => {
  resetIdempotencyFastPathForTests();
});

describe("withIdempotencyFastPath", () => {
  it("caches a successful result and does not re-invoke produce", async () => {
    const produce = vi.fn().mockResolvedValue({ ok: true, value: 1 });
    await withIdempotencyFastPath("token-a", produce);
    await withIdempotencyFastPath("token-a", produce);
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed result, so a retry re-invokes produce", async () => {
    const produce = vi.fn().mockResolvedValue({ ok: false, code: "server-error" });
    await withIdempotencyFastPath("token-b", produce);
    await withIdempotencyFastPath("token-b", produce);
    expect(produce).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight promise across concurrent calls with the same token", async () => {
    let resolveProduce!: (value: { ok: true }) => void;
    const produce = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveProduce = resolve;
        }),
    );
    const first = withIdempotencyFastPath("token-c", produce);
    const second = withIdempotencyFastPath("token-c", produce);
    resolveProduce({ ok: true });
    const [a, b] = await Promise.all([first, second]);
    expect(produce).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("never shares a cached result between different tokens", async () => {
    const produce = vi.fn().mockResolvedValue({ ok: true });
    await withIdempotencyFastPath("token-d1", produce);
    await withIdempotencyFastPath("token-d2", produce);
    expect(produce).toHaveBeenCalledTimes(2);
  });
});

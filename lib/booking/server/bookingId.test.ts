import { describe, it, expect } from "vitest";
import { generateBookingId } from "./bookingId";

describe("generateBookingId", () => {
  it("matches the BELA-YYYYMMDD-XXXXXX format with the safe alphabet", () => {
    const id = generateBookingId(new Date("2026-09-15T12:00:00Z"));
    expect(id).toMatch(/^BELA-20260915-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("uses the UTC calendar date of the provided `now`", () => {
    const id = generateBookingId(new Date("2026-01-01T02:00:00-05:00")); // 07:00 UTC, still Jan 1 UTC
    expect(id.startsWith("BELA-20260101-")).toBe(true);
  });

  it("generates distinct suffixes across many calls", () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateBookingId()));
    expect(ids.size).toBe(200);
  });
});

import { describe, it, expect } from "vitest";
import { computeAssignmentResponseDeadline } from "./assignmentDeadline";

const HOUR_MS = 60 * 60 * 1000;

describe("computeAssignmentResponseDeadline", () => {
  it("gives a 24-hour response window when offered more than 48 hours before service start", () => {
    const offeredAt = new Date("2026-03-01T00:00:00.000Z");
    const serviceStartAt = new Date(offeredAt.getTime() + 72 * HOUR_MS); // 72h out
    const result = computeAssignmentResponseDeadline(offeredAt, serviceStartAt);
    expect(result).toEqual({ ok: true, responseDeadline: new Date(offeredAt.getTime() + 24 * HOUR_MS) });
  });

  it("gives a 12-hour response window when offered between 24 and 48 hours before service start", () => {
    const offeredAt = new Date("2026-03-01T00:00:00.000Z");
    const serviceStartAt = new Date(offeredAt.getTime() + 36 * HOUR_MS); // 36h out
    const result = computeAssignmentResponseDeadline(offeredAt, serviceStartAt);
    expect(result).toEqual({ ok: true, responseDeadline: new Date(offeredAt.getTime() + 12 * HOUR_MS) });
  });

  it("uses the 12-hour window right at the 48-hour boundary (not the 24-hour window)", () => {
    const offeredAt = new Date("2026-03-01T00:00:00.000Z");
    const serviceStartAt = new Date(offeredAt.getTime() + 48 * HOUR_MS); // exactly 48h out
    const result = computeAssignmentResponseDeadline(offeredAt, serviceStartAt);
    expect(result).toEqual({ ok: true, responseDeadline: new Date(offeredAt.getTime() + 12 * HOUR_MS) });
  });

  it("uses the 24-hour window just over the 48-hour boundary", () => {
    const offeredAt = new Date("2026-03-01T00:00:00.000Z");
    const serviceStartAt = new Date(offeredAt.getTime() + 48 * HOUR_MS + 60_000); // 48h + 1min out
    const result = computeAssignmentResponseDeadline(offeredAt, serviceStartAt);
    expect(result).toEqual({ ok: true, responseDeadline: new Date(offeredAt.getTime() + 24 * HOUR_MS) });
  });

  it("allows (with a 12-hour window) right at the 24-hour boundary — only strictly less than 24h is blocked", () => {
    const offeredAt = new Date("2026-03-01T00:00:00.000Z");
    const serviceStartAt = new Date(offeredAt.getTime() + 24 * HOUR_MS); // exactly 24h out
    const result = computeAssignmentResponseDeadline(offeredAt, serviceStartAt);
    expect(result).toEqual({ ok: true, responseDeadline: new Date(offeredAt.getTime() + 12 * HOUR_MS) });
  });

  it("blocks automated assignment creation just under the 24-hour boundary", () => {
    const offeredAt = new Date("2026-03-01T00:00:00.000Z");
    const serviceStartAt = new Date(offeredAt.getTime() + 24 * HOUR_MS - 60_000); // 23h59m out
    const result = computeAssignmentResponseDeadline(offeredAt, serviceStartAt);
    expect(result.ok).toBe(false);
  });

  it("blocks automated assignment creation when offered less than 24 hours before service start", () => {
    const offeredAt = new Date("2026-03-01T00:00:00.000Z");
    const serviceStartAt = new Date(offeredAt.getTime() + 6 * HOUR_MS); // 6h out
    const result = computeAssignmentResponseDeadline(offeredAt, serviceStartAt);
    expect(result).toEqual({ ok: false, reason: "too-close-to-service-start", hoursUntilServiceStart: 6 });
  });

  it("blocks when the service start has already passed (negative hours)", () => {
    const offeredAt = new Date("2026-03-01T00:00:00.000Z");
    const serviceStartAt = new Date(offeredAt.getTime() - HOUR_MS); // already started
    const result = computeAssignmentResponseDeadline(offeredAt, serviceStartAt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.hoursUntilServiceStart).toBeLessThan(0);
  });

  it("never returns a deadline at or after the service start time", () => {
    const offeredAt = new Date("2026-03-01T00:00:00.000Z");
    const serviceStartAt = new Date(offeredAt.getTime() + 25 * HOUR_MS); // just over the block threshold
    const result = computeAssignmentResponseDeadline(offeredAt, serviceStartAt);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.responseDeadline.getTime()).toBeLessThan(serviceStartAt.getTime());
  });
});

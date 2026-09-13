import { describe, it, expect } from "vitest";
import { arrivalWindowStartSpec, calculateServiceStart, resolveRecordStartSpec, ServiceTimeError } from "./serviceTime";

const TZ = "America/New_York";

describe("arrivalWindowStartSpec", () => {
  it("maps each legacy arrival window to its documented 24-hour start time", () => {
    expect(arrivalWindowStartSpec("morning")).toEqual({ hour: 8, minute: 0 });
    expect(arrivalWindowStartSpec("midday")).toEqual({ hour: 10, minute: 0 });
    expect(arrivalWindowStartSpec("early-afternoon")).toEqual({ hour: 12, minute: 0 });
    expect(arrivalWindowStartSpec("afternoon")).toEqual({ hour: 14, minute: 0 });
  });
});

describe("resolveRecordStartSpec — Milestone 6 amendment chokepoint", () => {
  it("prefers an exact Service Start Time when populated", () => {
    const spec = resolveRecordStartSpec({ serviceStartTime: "09:00", arrivalWindow: "Morning" });
    expect(spec).toEqual({ hour: 9, minute: 0 });
  });

  it("falls back to the legacy Arrival Window label when Service Start Time is blank", () => {
    const spec = resolveRecordStartSpec({ serviceStartTime: "", arrivalWindow: "Afternoon" });
    expect(spec).toEqual({ hour: 14, minute: 0 });
  });

  it("throws ServiceTimeError for a malformed Service Start Time", () => {
    expect(() => resolveRecordStartSpec({ serviceStartTime: "not-a-time", arrivalWindow: "" })).toThrow(ServiceTimeError);
  });

  it("throws ServiceTimeError when both fields are blank", () => {
    expect(() => resolveRecordStartSpec({ serviceStartTime: "", arrivalWindow: "" })).toThrow(ServiceTimeError);
  });

  it("throws ServiceTimeError for an unrecognized Arrival Window label", () => {
    expect(() => resolveRecordStartSpec({ serviceStartTime: "", arrivalWindow: "Not A Real Window" })).toThrow(ServiceTimeError);
  });
});

describe("calculateServiceStart", () => {
  it("converts an exact-time spec to the correct UTC instant, DST-safe (EDT, summer)", () => {
    const result = calculateServiceStart("2026-07-15", { hour: 9, minute: 0 }, TZ);
    expect(result.toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  it("converts an exact-time spec to the correct UTC instant, DST-safe (EST, winter)", () => {
    const result = calculateServiceStart("2026-01-15", { hour: 9, minute: 0 }, TZ);
    expect(result.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("still works with a legacy arrival-window-derived spec", () => {
    const result = calculateServiceStart("2026-06-01", arrivalWindowStartSpec("morning"), TZ);
    expect(result.toISOString()).toBe("2026-06-01T12:00:00.000Z"); // 8am EDT = 12:00 UTC
  });
});

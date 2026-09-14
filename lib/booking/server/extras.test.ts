import { describe, it, expect } from "vitest";
import { serializeExtras, parseExtrasKeys } from "./extras";
import { initialExtrasState } from "@/lib/booking/types";

describe("serializeExtras", () => {
  it('returns "none" when noExtras is true', () => {
    expect(serializeExtras({ ...initialExtrasState, noExtras: true })).toBe("none");
  });

  it('returns "none" when nothing is selected', () => {
    expect(serializeExtras(initialExtrasState)).toBe("none");
  });

  it("serializes boolean extras in canonical order regardless of struct field order", () => {
    const extras = { ...initialExtrasState, oven: true, kitchenCabinets: true, refrigerator: true };
    expect(serializeExtras(extras)).toBe("kitchenCabinets;refrigerator;oven");
  });

  it("includes quantity extras only when greater than zero, formatted as key:qty", () => {
    const extras = { ...initialExtrasState, interiorWindowsQty: 3, blindsQty: 0 };
    expect(serializeExtras(extras)).toBe("interiorWindows:3");
  });

  it("combines booleans and quantities in the fixed canonical order", () => {
    const extras = { ...initialExtrasState, oven: true, blindsQty: 2, kitchenCabinets: true };
    expect(serializeExtras(extras)).toBe("kitchenCabinets;oven;blinds:2");
  });
});

describe("parseExtrasKeys", () => {
  it('returns [] for "none"', () => {
    expect(parseExtrasKeys("none")).toEqual([]);
  });

  it('returns [] for ""', () => {
    expect(parseExtrasKeys("")).toEqual([]);
  });

  it("returns bare keys for boolean extras", () => {
    expect(parseExtrasKeys("kitchenCabinets;oven")).toEqual(["kitchenCabinets", "oven"]);
  });

  it("drops the :quantity suffix for quantity extras", () => {
    expect(parseExtrasKeys("interiorWindows:3;blinds:2")).toEqual(["interiorWindows", "blinds"]);
  });

  it("round-trips serializeExtras' own output", () => {
    const extras = { ...initialExtrasState, oven: true, kitchenCabinets: true, interiorWindowsQty: 2 };
    expect(parseExtrasKeys(serializeExtras(extras))).toEqual(["kitchenCabinets", "oven", "interiorWindows"]);
  });
});

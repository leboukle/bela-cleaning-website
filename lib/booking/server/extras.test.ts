import { describe, it, expect } from "vitest";
import { serializeExtras } from "./extras";
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

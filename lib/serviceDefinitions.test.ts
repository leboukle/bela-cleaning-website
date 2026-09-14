import { describe, it, expect } from "vitest";
import { getServiceScope, isAddOnType, SERVICE_DEFINITIONS } from "./serviceDefinitions";

describe("getServiceScope", () => {
  it("returns the full, unfiltered includes/excludes when no add-ons are selected (the public Services page's use case)", () => {
    const scope = getServiceScope("standard");
    expect(scope.includes).toEqual(SERVICE_DEFINITIONS.standard.includes);
    expect(scope.excludes).toEqual(SERVICE_DEFINITIONS.standard.excludes.map((item) => item.text));
    expect(scope.selectedAddOns).toEqual([]);
  });

  it("removes a single-add-on exclusion once that add-on is selected", () => {
    const scope = getServiceScope("standard", ["interiorWindows"]);
    expect(scope.excludes).not.toContain("Interior windows");
  });

  it("keeps every other exclusion untouched when only one add-on is selected", () => {
    const scope = getServiceScope("standard", ["interiorWindows"]);
    expect(scope.excludes).toContain("Baseboards, doors, and trim detailing");
    expect(scope.excludes).toContain("Inside cabinets or drawers");
  });

  it("buying only the oven add-on removes only the oven exclusion — the refrigerator exclusion still applies", () => {
    // Oven and refrigerator are independent, separately-purchasable
    // add-ons with their own exclusion lines. Buying oven must not
    // silently imply refrigerator cleaning is included too.
    const scope = getServiceScope("standard", ["oven"]);
    expect(scope.excludes).not.toContain("Inside oven unless selected as an add-on");
    expect(scope.excludes).toContain("Inside refrigerator unless selected as an add-on");
  });

  it("buying only the refrigerator add-on removes only the refrigerator exclusion — the oven exclusion still applies", () => {
    const scope = getServiceScope("standard", ["refrigerator"]);
    expect(scope.excludes).not.toContain("Inside refrigerator unless selected as an add-on");
    expect(scope.excludes).toContain("Inside oven unless selected as an add-on");
  });

  it("buying both oven and refrigerator removes both exclusions", () => {
    const scope = getServiceScope("standard", ["oven", "refrigerator"]);
    expect(scope.excludes).not.toContain("Inside oven unless selected as an add-on");
    expect(scope.excludes).not.toContain("Inside refrigerator unless selected as an add-on");
  });

  it("lists the selected add-ons by their display name", () => {
    const scope = getServiceScope("deep", ["kitchenCabinets", "blinds"]);
    expect(scope.selectedAddOns.map((a) => a.name)).toEqual(["Inside Kitchen Cabinets", "Blinds"]);
  });

  it("gives Move-In and Move-Out Cleaning distinct names but identical scope copy", () => {
    const moveIn = getServiceScope("move-in");
    const moveOut = getServiceScope("move-out");
    expect(moveIn.serviceName).toBe("Move-In Cleaning");
    expect(moveOut.serviceName).toBe("Move-Out Cleaning");
    expect(moveIn.includes).toEqual(moveOut.includes);
    expect(moveIn.excludes).toEqual(moveOut.excludes);
    expect(moveIn.description).toBe(moveOut.description);
  });

  it("never lets Move-In/Move-Out's included cabinets get confused with Standard's excluded cabinets", () => {
    // Move-in/out includes cabinet cleaning by default (empty-home
    // service); Standard excludes it unless purchased as an add-on. These
    // are genuinely different scopes and must not be accidentally shared.
    const moveIn = getServiceScope("move-in");
    expect(moveIn.includes).toContain("Inside empty cabinets and drawers");
    expect(moveIn.excludes).not.toContain("Inside cabinets or drawers");
  });
});

describe("isAddOnType", () => {
  it("accepts every real add-on key", () => {
    for (const key of ["kitchenCabinets", "refrigerator", "oven", "interiorWindows", "blinds"]) {
      expect(isAddOnType(key)).toBe(true);
    }
  });

  it("rejects a key that isn't a real add-on", () => {
    expect(isAddOnType("heavyPetHair")).toBe(false);
    expect(isAddOnType("")).toBe(false);
  });
});

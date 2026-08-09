import { describe, it, expect } from "vitest";
import { describeExtras } from "./extrasDescription";

describe("describeExtras", () => {
  it('returns an empty list for "none"', () => {
    expect(describeExtras("none")).toEqual([]);
  });

  it("returns an empty list for an empty string", () => {
    expect(describeExtras("")).toEqual([]);
  });

  it("describes a single boolean extra", () => {
    expect(describeExtras("kitchenCabinets")).toEqual(["Inside kitchen cabinets"]);
  });

  it("describes boolean and quantity extras together, in serialized order", () => {
    expect(describeExtras("kitchenCabinets;interiorWindows:3")).toEqual([
      "Inside kitchen cabinets",
      "Interior windows × 3",
    ]);
  });

  it("falls back to the raw key for an unrecognized token", () => {
    expect(describeExtras("somethingNew")).toEqual(["somethingNew"]);
  });
});

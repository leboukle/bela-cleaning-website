import { describe, it, expect } from "vitest";
import { roundMoney, toCents, centsToDollars } from "./money";

describe("money helpers", () => {
  it("fixes classic floating point drift", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it("round-trips cents and dollars", () => {
    expect(centsToDollars(toCents(19.99))).toBe(19.99);
  });

  it("rounds to the nearest cent", () => {
    expect(roundMoney(19.996)).toBe(20);
  });
});

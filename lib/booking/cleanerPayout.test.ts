import { describe, it, expect } from "vitest";
import { calculatePayoutAmount, STANDARD_CLEANER_PAYOUT_PERCENTAGE } from "./cleanerPayout";

describe("STANDARD_CLEANER_PAYOUT_PERCENTAGE", () => {
  it("is BeLa's standing 60% compensation rate", () => {
    expect(STANDARD_CLEANER_PAYOUT_PERCENTAGE).toBe(0.6);
  });
});

describe("calculatePayoutAmount", () => {
  it("computes the standard 60% payout", () => {
    expect(calculatePayoutAmount(190.5)).toBe(114.3);
  });

  it("rounds to the nearest cent rather than carrying floating-point drift", () => {
    expect(calculatePayoutAmount(100.01)).toBe(60.01);
  });

  it("returns 0 for a $0 cleaning total", () => {
    expect(calculatePayoutAmount(0)).toBe(0);
  });
});

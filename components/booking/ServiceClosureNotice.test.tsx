// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import IntroStep from "./steps/IntroStep";

const MESSAGE = "We’re not accepting new cleaning appointments for the remainder of 2026. Thank you for your understanding.";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("closure notice before the customer enters booking details", () => {
  it("is shown on the very first screen while the closure is ahead or in progress", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 22, 10, 0, 0));
    render(<IntroStep onStart={() => {}} />);
    expect(screen.getByText(MESSAGE)).toBeTruthy();
  });

  it("is gone once the closure has passed", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 0, 2, 10, 0, 0));
    render(<IntroStep onStart={() => {}} />);
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });
});

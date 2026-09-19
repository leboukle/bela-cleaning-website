// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DeepCleaningNoticeDialog from "./DeepCleaningNoticeDialog";

afterEach(() => {
  cleanup();
});

function renderDialog() {
  const handlers = { onSwitchToDeep: vi.fn(), onKeepStandard: vi.fn(), onDismiss: vi.fn() };
  render(<DeepCleaningNoticeDialog {...handlers} />);
  return handlers;
}

describe("DeepCleaningNoticeDialog", () => {
  it("renders the approved title, body, both options, and the scope notice", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Your notes may require a Deep Cleaning" })).toBeTruthy();
    expect(
      screen.getByText(/You selected Standard Cleaning, which is designed for routine upkeep in a home that.s already in good shape\. Your notes mention deep-cleaning needs\./),
    ).toBeTruthy();
    expect(screen.getByText("Would you like to update your service?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch to Deep Cleaning (+$100)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep Standard Cleaning" })).toBeTruthy();
    expect(
      screen.getByText("Requests outside the scope of Standard Cleaning may not be completed during your appointment."),
    ).toBeTruthy();
  });

  it("the primary button only switches to Deep", () => {
    const h = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Deep Cleaning (+$100)" }));
    expect(h.onSwitchToDeep).toHaveBeenCalledTimes(1);
    expect(h.onKeepStandard).not.toHaveBeenCalled();
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it("the secondary button only keeps Standard", () => {
    const h = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Keep Standard Cleaning" }));
    expect(h.onKeepStandard).toHaveBeenCalledTimes(1);
    expect(h.onSwitchToDeep).not.toHaveBeenCalled();
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it("the close button, Escape, and a backdrop click only dismiss — never a choice", () => {
    const h = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByTestId("deep-cleaning-notice-backdrop"));
    expect(h.onDismiss).toHaveBeenCalledTimes(3);
    expect(h.onKeepStandard).not.toHaveBeenCalled();
    expect(h.onSwitchToDeep).not.toHaveBeenCalled();
  });

  it("clicking inside the dialog does not dismiss it", () => {
    const h = renderDialog();
    fireEvent.click(screen.getByRole("dialog"));
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it("moves focus to the primary option when opened", () => {
    renderDialog();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Switch to Deep Cleaning (+$100)" }));
  });
});

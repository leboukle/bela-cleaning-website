// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { useMemo, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReviewStep from "./ReviewStep";
import DeepCleaningNoticeDialog from "@/components/booking/DeepCleaningNoticeDialog";
import { useDeepCleaningNotice } from "@/components/booking/useDeepCleaningNotice";
import { calculateEstimate } from "@/lib/booking/calculate";
import { initialBookingState, initialExtrasState, type BookingState, type CleaningTypeId } from "@/lib/booking/types";

afterEach(() => {
  cleanup();
});

function completeState(overrides: Partial<BookingState> = {}): BookingState {
  return {
    ...initialBookingState,
    propertyType: "apartment",
    squareFootage: "1001-2000",
    bedrooms: "2",
    bathrooms: "2",
    cleaningType: "standard",
    extras: { ...initialExtrasState, noExtras: true },
    frequency: "one-time",
    zipCode: "07030",
    appointmentDate: "2026-12-01",
    serviceStartTime: "09:00",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    phone: "5551234567",
    addressStreet: "123 Main St",
    addressCity: "Hoboken",
    addressState: "New Jersey",
    addressZip: "07030",
    someoneHome: "home",
    agreedToPolicy: true,
    setupIntentId: "seti_test",
    ...overrides,
  };
}

// Mirrors BookingFlow's exact wiring (same hook, same dialog, same
// switch-to-deep handler) around the real ReviewStep, with the real
// centralized estimate — so the safeguard's user-visible behavior can be
// exercised without navigating the whole flow through the Stripe step.
function Harness({ initial, onSubmit }: { initial: BookingState; onSubmit: () => void }) {
  const [state, setState] = useState(initial);
  const [switched, setSwitched] = useState(false);
  const estimate = useMemo(() => calculateEstimate(state), [state]);
  const gate = useDeepCleaningNotice({
    cleaningType: state.cleaningType,
    notes: state.specialInstructions,
    onSubmit,
    onSwitchToDeep: () => {
      setSwitched(true);
      setState((s) => ({ ...s, cleaningType: "deep" as CleaningTypeId }));
    },
  });
  return (
    <>
      <ReviewStep
        state={state}
        estimate={estimate}
        onEdit={() => {}}
        onAgreedChange={() => {}}
        submission={{ status: "idle" }}
        onSubmit={gate.requestSubmit}
        switchedToDeepCleaning={switched}
        onPickNewDate={() => {}}
        onRedoPayment={() => {}}
        honeypot=""
        onHoneypotChange={() => {}}
        onBack={() => {}}
      />
      <button type="button" onClick={() => setState((s) => ({ ...s, specialInstructions: `${s.specialInstructions} Also the oven needs a deep clean.` }))}>
        test-append-notes
      </button>
      {gate.isOpen && (
        <DeepCleaningNoticeDialog onSwitchToDeep={gate.switchToDeep} onKeepStandard={gate.keepStandard} onDismiss={gate.dismiss} />
      )}
    </>
  );
}

const submitButton = () => screen.getByRole("button", { name: /submit booking request/i });
const dialog = () => screen.queryByRole("dialog", { name: "Your notes may require a Deep Cleaning" });

describe("Standard/Deep notes safeguard on the Review submit", () => {
  it("Standard + 'floors need deep cleaning' → warning, and the booking is NOT submitted", () => {
    const onSubmit = vi.fn();
    render(<Harness initial={completeState({ specialInstructions: "floors need deep cleaning" })} onSubmit={onSubmit} />);
    fireEvent.click(submitButton());
    expect(dialog()).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Standard + 'Please DEEP CLEAN the bathrooms' → warning", () => {
    render(<Harness initial={completeState({ specialInstructions: "Please DEEP CLEAN the bathrooms" })} onSubmit={vi.fn()} />);
    fireEvent.click(submitButton());
    expect(dialog()).toBeTruthy();
  });

  it("Standard + 'kitchen needs a deep-clean' → warning", () => {
    render(<Harness initial={completeState({ specialInstructions: "kitchen needs a deep-clean" })} onSubmit={vi.fn()} />);
    fireEvent.click(submitButton());
    expect(dialog()).toBeTruthy();
  });

  it("Standard + ordinary notes → no warning, booking submits", () => {
    const onSubmit = vi.fn();
    render(<Harness initial={completeState({ specialInstructions: "Please pay extra attention to the kitchen" })} onSubmit={onSubmit} />);
    fireEvent.click(submitButton());
    expect(dialog()).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Deep Cleaning + 'deep clean the floors' → no mismatch warning", () => {
    const onSubmit = vi.fn();
    render(<Harness initial={completeState({ cleaningType: "deep", specialInstructions: "deep clean the floors" })} onSubmit={onSubmit} />);
    fireEvent.click(submitButton());
    expect(dialog()).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("dismissing the warning without choosing does NOT submit and is NOT an acknowledgement (next submit warns again)", () => {
    const onSubmit = vi.fn();
    render(<Harness initial={completeState({ specialInstructions: "floors need deep cleaning" })} onSubmit={onSubmit} />);
    fireEvent.click(submitButton());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialog()).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(submitButton());
    expect(dialog()).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Keep Standard → submits, keeps Standard, price and duration unchanged, notes untouched", () => {
    const onSubmit = vi.fn();
    render(<Harness initial={completeState({ specialInstructions: "floors need deep cleaning" })} onSubmit={onSubmit} />);
    expect(screen.getByText("$165")).toBeTruthy();
    expect(screen.getByText("Estimated duration: 3 hr 45 min")).toBeTruthy(); // 150 + 60 + 15 = 225 min

    fireEvent.click(submitButton());
    fireEvent.click(screen.getByRole("button", { name: "Keep Standard Cleaning" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
    expect(screen.getByText("Standard cleaning")).toBeTruthy();
    expect(screen.getByText("$165")).toBeTruthy();
    expect(screen.getByText("Estimated duration: 3 hr 45 min")).toBeTruthy();
    expect(screen.getByText("floors need deep cleaning")).toBeTruthy();
  });

  it("Keep Standard → the same unchanged state does not warn again on the next submit attempt", () => {
    const onSubmit = vi.fn();
    render(<Harness initial={completeState({ specialInstructions: "floors need deep cleaning" })} onSubmit={onSubmit} />);
    fireEvent.click(submitButton());
    fireEvent.click(screen.getByRole("button", { name: "Keep Standard Cleaning" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.click(submitButton());
    expect(dialog()).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("Keep Standard → materially changing the notes afterwards re-evaluates and warns again", () => {
    const onSubmit = vi.fn();
    render(<Harness initial={completeState({ specialInstructions: "floors need deep cleaning" })} onSubmit={onSubmit} />);
    fireEvent.click(submitButton());
    fireEvent.click(screen.getByRole("button", { name: "Keep Standard Cleaning" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "test-append-notes" }));
    fireEvent.click(submitButton());
    expect(dialog()).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Switch to Deep → service becomes Deep, the existing +$100 and +90 min apply exactly once, nothing else changes, and the customer can then submit", () => {
    const onSubmit = vi.fn();
    render(<Harness initial={completeState({ specialInstructions: "floors need deep cleaning" })} onSubmit={onSubmit} />);
    // Before: 130 + 20 + 15 = $165, 150 + 60 + 15 = 225 min.
    expect(screen.getByText("$165")).toBeTruthy();

    fireEvent.click(submitButton());
    fireEvent.click(screen.getByRole("button", { name: "Switch to Deep Cleaning (+$100)" }));

    // The dialog closes; no submission yet — the customer reviews the new total first.
    expect(dialog()).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    // After: 130 + 20 + 15 + 100 (Deep, once) = $265; 225 + 90 (Deep, once) = 315 min = 5 hr 15 min.
    expect(screen.getByText("Deep cleaning")).toBeTruthy();
    expect(screen.getByText("$265")).toBeTruthy();
    expect(screen.getByText("Estimated duration: 5 hr 15 min")).toBeTruthy();
    // Every other selection preserved.
    expect(screen.getByText("2 bedrooms")).toBeTruthy();
    expect(screen.getByText("2 bathrooms")).toBeTruthy();
    expect(screen.getByText("1,001–2,000 sq. ft.")).toBeTruthy();
    expect(screen.getByText("floors need deep cleaning")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/Deep Cleaning/);

    // Now Deep + trigger notes: no mismatch, submission goes through.
    fireEvent.click(submitButton());
    expect(dialog()).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

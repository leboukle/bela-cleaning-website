// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { useMemo, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReviewStep from "./steps/ReviewStep";
import { useDeepCleaningNotice } from "./useDeepCleaningNotice";
import { calculateEstimate } from "@/lib/booking/calculate";
import { withAppointmentDate } from "@/lib/booking/appointmentSelection";
import { initialBookingState, initialExtrasState, type BookingState } from "@/lib/booking/types";

afterEach(() => {
  cleanup();
});

const DATE_A = "2026-12-01";
const DATE_B = "2026-12-02";

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
    appointmentDate: DATE_A,
    serviceStartTime: "10:00",
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

describe("withAppointmentDate", () => {
  it("1. Date A + selected time → Date B clears the selected time and never carries or auto-selects one", () => {
    const next = withAppointmentDate(completeState(), DATE_B);
    expect(next.appointmentDate).toBe(DATE_B);
    expect(next.serviceStartTime).toBeNull();
  });

  it("2. re-setting the same date keeps a valid time (and returns the same state object, so nothing re-renders needlessly)", () => {
    const state = completeState();
    const next = withAppointmentDate(state, DATE_A);
    expect(next).toBe(state);
    expect(next.serviceStartTime).toBe("10:00");
  });

  it("selecting a first date when none was chosen leaves the (empty) time empty", () => {
    const next = withAppointmentDate(completeState({ appointmentDate: null, serviceStartTime: null }), DATE_A);
    expect(next.appointmentDate).toBe(DATE_A);
    expect(next.serviceStartTime).toBeNull();
  });

  it("changes nothing else about the booking", () => {
    const state = completeState();
    const next = withAppointmentDate(state, DATE_B);
    expect({ ...next, appointmentDate: state.appointmentDate, serviceStartTime: state.serviceStartTime }).toEqual(state);
  });
});

// Mirrors BookingFlow's wiring for the Review screen: the same date handler
// (withAppointmentDate) and the same time-selection state change, around the
// real ReviewStep, so submit gating is exercised through real UI.
function Harness({ initial, onSubmit }: { initial: BookingState; onSubmit: () => void }) {
  const [state, setState] = useState(initial);
  const estimate = useMemo(() => calculateEstimate(state), [state]);
  const gate = useDeepCleaningNotice({ cleaningType: state.cleaningType, notes: state.specialInstructions, onSubmit, onSwitchToDeep: () => {} });
  return (
    <>
      <ReviewStep
        state={state}
        estimate={estimate}
        onEdit={() => {}}
        onAgreedChange={() => {}}
        submission={{ status: "idle" }}
        onSubmit={gate.requestSubmit}
        onPickNewDate={() => {}}
        onRedoPayment={() => {}}
        honeypot=""
        onHoneypotChange={() => {}}
        onBack={() => {}}
      />
      <button type="button" onClick={() => setState((s) => withAppointmentDate(s, DATE_A))}>pick-date-A</button>
      <button type="button" onClick={() => setState((s) => withAppointmentDate(s, DATE_B))}>pick-date-B</button>
      <button type="button" onClick={() => setState((s) => ({ ...s, serviceStartTime: "11:00" }))}>pick-time-11</button>
    </>
  );
}

const appointmentDate = () => screen.getByText("Appointment date").nextElementSibling?.textContent;
const appointmentTime = () => screen.getByText("Appointment time").nextElementSibling?.textContent;
const submit = () => screen.getByRole("button", { name: /submit booking request/i }) as HTMLButtonElement;
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("changing the appointment date on the Review screen", () => {
  it("1. Date A + time → Date B: the time is cleared and shows as not yet chosen", () => {
    render(<Harness initial={completeState()} onSubmit={vi.fn()} />);
    expect(appointmentDate()).toMatch(/December 1, 2026/);
    expect(appointmentTime()).toBe("10:00 AM");

    click("pick-date-B");
    expect(appointmentDate()).toMatch(/December 2, 2026/);
    expect(appointmentTime()).toBe("—");
  });

  it("2. re-selecting the same date does not clear a valid time, and submit stays available", () => {
    const onSubmit = vi.fn();
    render(<Harness initial={completeState()} onSubmit={onSubmit} />);
    click("pick-date-A");
    expect(appointmentTime()).toBe("10:00 AM");
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("3. after changing the date the customer cannot submit until a new time is selected", () => {
    const onSubmit = vi.fn();
    render(<Harness initial={completeState()} onSubmit={onSubmit} />);
    click("pick-date-B");
    expect(submit().disabled).toBe(true);
    fireEvent.click(submit());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("4. selecting a new time for Date B restores the normal booking flow", () => {
    const onSubmit = vi.fn();
    render(<Harness initial={completeState()} onSubmit={onSubmit} />);
    click("pick-date-B");
    expect(submit().disabled).toBe(true);

    click("pick-time-11");
    expect(appointmentDate()).toMatch(/December 2, 2026/);
    expect(appointmentTime()).toBe("11:00 AM");
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

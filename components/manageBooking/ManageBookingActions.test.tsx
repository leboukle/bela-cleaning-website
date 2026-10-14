// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ManageBookingActions from "./ManageBookingActions";
import type { ManageBookingView } from "@/lib/booking/server/manageBookingView";

afterEach(() => cleanup());

function view(overrides: Partial<ManageBookingView> = {}): ManageBookingView {
  return {
    bookingId: "BELA-20261109-ABCDEF",
    displayStatus: "Confirmed",
    serviceDate: "2026-11-09",
    scheduleDisplayLabel: "9:00 AM",
    streetAddress: "123 Main St",
    apartmentOrUnit: "",
    city: "Hoboken",
    state: "New Jersey",
    zipCode: "07030",
    cleaningType: "Standard cleaning",
    estimatedDurationMinutes: 240,
    totalPrice: 145.5,
    extras: [],
    frequency: "Weekly",
    recurring: {
      frequency: "Weekly",
      scheduleStatus: "Active",
      canStop: true,
      nextRegularDate: "2026-11-16",
      upcoming: {
        bookingId: "BELA-20261109-ABCDEF",
        serviceDate: "2026-11-09",
        scheduleDisplayLabel: "9:00 AM",
        totalPrice: 145.5,
        isThisAppointment: true,
        isLateWindow: false,
        lateCancellationFeeCents: null,
      },
    },
    eligibility: { canCancel: true, canReschedule: true, isLateWindow: false, lateCancellationFeeCents: null },
    ...overrides,
  };
}

describe("Manage Booking — recurring controls", () => {
  it("offers two clearly separate actions", () => {
    render(<ManageBookingActions token={"T".repeat(43)} initialBooking={view()} />);
    expect(screen.getByRole("button", { name: "Cancel this cleaning only" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop recurring cleanings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });

  it("a one-time booking keeps the plain cancel button and shows no recurring controls", () => {
    render(<ManageBookingActions token={"T".repeat(43)} initialBooking={view({ recurring: null, frequency: "One time" })} />);
    expect(screen.getByRole("button", { name: "Cancel booking" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stop recurring cleanings" })).toBeNull();
  });

  it("'Cancel this cleaning only' names the exact appointment and says the series continues", () => {
    render(<ManageBookingActions token={"T".repeat(43)} initialBooking={view()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel this cleaning only" }));
    const text = document.body.textContent ?? "";
    expect(text).toContain("cancelling only");
    expect(text).toContain("November 9, 2026");
    expect(text).toContain("recurring cleanings continue");
    expect(text).toContain("November 16, 2026");
    expect(text).toContain("This cancellation is free");
  });

  it("stop confirmation separates ending the schedule (no fee) from the upcoming cleaning (free, >24h)", () => {
    render(<ManageBookingActions token={"T".repeat(43)} initialBooking={view()} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop recurring cleanings" }));
    const text = document.body.textContent ?? "";
    expect(text).toContain("1. Ending your recurring cleanings");
    expect(text).toContain("Stopping has no fee");
    expect(text).toContain("2. Your upcoming cleaning");
    expect(text).toContain("November 9, 2026");
    expect(text).toContain("No fee");
    expect(text).toContain("that cleaning is more than 24 hours away, so cancelling it is free");
    expect(screen.getByRole("button", { name: "Yes, stop recurring cleanings" })).toBeTruthy();
  });

  it("stop confirmation shows the late fee for the upcoming cleaning, and says it is not a fee for stopping", () => {
    const late = view({
      recurring: {
        frequency: "Weekly",
        scheduleStatus: "Active",
        canStop: true,
        nextRegularDate: "2026-11-16",
        upcoming: {
          bookingId: "BELA-20261109-ABCDEF",
          serviceDate: "2026-11-09",
          scheduleDisplayLabel: "9:00 AM",
          totalPrice: 145.5,
          isThisAppointment: true,
          isLateWindow: true,
          lateCancellationFeeCents: 7275,
        },
      },
      eligibility: { canCancel: true, canReschedule: false, isLateWindow: true, lateCancellationFeeCents: 7275 },
    });
    render(<ManageBookingActions token={"T".repeat(43)} initialBooking={late} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop recurring cleanings" }));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Stopping has no fee");
    expect(text).toContain("late-cancellation fee of $72.75");
    expect(text).toContain("This fee is for cancelling that cleaning — not for stopping");
  });

  it("deep links from emails open the matching confirmation (still requiring an explicit confirm)", () => {
    render(<ManageBookingActions token={"T".repeat(43)} initialBooking={view()} initialAction="stop" />);
    expect(screen.getByRole("button", { name: "Yes, stop recurring cleanings" })).toBeTruthy();
    cleanup();
    render(<ManageBookingActions token={"T".repeat(43)} initialBooking={view()} initialAction="cancel-one" />);
    expect(screen.getByRole("button", { name: "Yes, cancel this cleaning only" })).toBeTruthy();
  });

  it("an ended schedule shows no stop control", () => {
    const ended = view({
      recurring: { frequency: "Weekly", scheduleStatus: "Ended", canStop: false, nextRegularDate: null, upcoming: null },
    });
    render(<ManageBookingActions token={"T".repeat(43)} initialBooking={ended} />);
    expect(screen.queryByRole("button", { name: "Stop recurring cleanings" })).toBeNull();
    expect(document.body.textContent).toContain("Your recurring cleanings have ended");
  });
});

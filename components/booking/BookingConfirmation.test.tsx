// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import BookingConfirmation from "./BookingConfirmation";
import { initialBookingState, initialExtrasState } from "@/lib/booking/types";
import type { BookingState } from "@/lib/booking/types";

afterEach(() => {
  cleanup();
});

function sampleState(overrides: Partial<BookingState> = {}): BookingState {
  return {
    ...initialBookingState,
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    phone: "5551234567",
    propertyType: "apartment",
    squareFootage: "1001-2000",
    bedrooms: "2",
    bathrooms: "2",
    cleaningType: "standard",
    frequency: "weekly",
    addressStreet: "123 Main St",
    addressUnit: "",
    addressCity: "Hoboken",
    addressState: "New Jersey",
    addressZip: "07030",
    ...overrides,
  };
}

const SUBMISSION = {
  bookingId: "BELA-20260101-ABCDEF",
  serviceDate: "2026-02-16",
  arrivalWindow: "Morning",
  totalPrice: 190.5,
  estimatedDurationMinutes: 270,
};

describe("BookingConfirmation", () => {
  it("renders the 'Booking request received' heading", () => {
    render(<BookingConfirmation state={sampleState()} submission={SUBMISSION} />);
    expect(screen.getByRole("heading", { name: "Booking request received" })).toBeTruthy();
  });

  it("displays the correct Booking ID", () => {
    render(<BookingConfirmation state={sampleState()} submission={SUBMISSION} />);
    expect(screen.getByText("BELA-20260101-ABCDEF")).toBeTruthy();
  });

  it("displays the correct appointment information (date, arrival window, cleaning type)", () => {
    render(<BookingConfirmation state={sampleState()} submission={SUBMISSION} />);
    expect(screen.getByText(/February 16, 2026/)).toBeTruthy();
    expect(screen.getByText("Morning")).toBeTruthy();
    expect(screen.getByText("Standard cleaning")).toBeTruthy();
  });

  it("displays the correct calculated total", () => {
    render(<BookingConfirmation state={sampleState()} submission={SUBMISSION} />);
    expect(screen.getByText("$190.50")).toBeTruthy();
  });

  it("displays the correct estimated duration", () => {
    render(<BookingConfirmation state={sampleState()} submission={SUBMISSION} />);
    expect(screen.getByText("4 hr 30 min")).toBeTruthy();
  });

  it("hides the extras line when no extras were selected", () => {
    const state = sampleState({ extras: { ...initialExtrasState, noExtras: true } });
    render(<BookingConfirmation state={state} submission={SUBMISSION} />);
    expect(screen.queryByText("Extras")).toBeNull();
  });

  it("displays selected extras correctly when present", () => {
    const state = sampleState({
      extras: { ...initialExtrasState, kitchenCabinets: true, interiorWindowsQty: 3, noExtras: false },
    });
    render(<BookingConfirmation state={state} submission={SUBMISSION} />);
    expect(screen.getByText("Inside kitchen cabinets, Interior windows × 3")).toBeTruthy();
  });

  it("hides frequency when one-time", () => {
    const state = sampleState({ frequency: "one-time" });
    render(<BookingConfirmation state={state} submission={SUBMISSION} />);
    expect(screen.queryByText("Frequency")).toBeNull();
  });

  it("shows frequency when recurring", () => {
    const state = sampleState({ frequency: "weekly" });
    render(<BookingConfirmation state={state} submission={SUBMISSION} />);
    expect(screen.getByText("Frequency")).toBeTruthy();
    expect(screen.getByText("Weekly")).toBeTruthy();
  });

  it("never claims the appointment is fully confirmed, paid, or that a cleaner has been assigned", () => {
    render(<BookingConfirmation state={sampleState()} submission={SUBMISSION} />);
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("your appointment is confirmed");
    expect(text).not.toContain("cleaner has been assigned");
    expect(text).not.toContain("payment has been collected");
    expect(text).toContain("payment has not yet been processed");
  });

  it("does not display internal administrative fields or spreadsheet details", () => {
    render(<BookingConfirmation state={sampleState()} submission={SUBMISSION} />);
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("row");
    expect(text).not.toContain("spreadsheet");
    expect(text).not.toContain("internal notes");
  });
});

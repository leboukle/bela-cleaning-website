// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import BookingFlow from "./BookingFlow";
import BookingConfirmation from "./BookingConfirmation";
import ReviewStep from "./steps/ReviewStep";
import FrequencyStep from "./steps/FrequencyStep";
import IntroStep from "./steps/IntroStep";
import { calculateEstimate } from "@/lib/booking/calculate";
import { FIRST_CLEANING_NOTICE, RECURRING_CONSENT_TEXT } from "@/lib/booking/recurringPricing";
import { initialBookingState, initialExtrasState, type BookingState } from "@/lib/booking/types";

beforeEach(() => {
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
    frequency: "weekly",
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

function renderReview(state: BookingState, onSubmit: () => void = () => {}, onConsent: (v: boolean) => void = () => {}) {
  const estimate = calculateEstimate({ ...state, applyFrequencyDiscount: false });
  render(
    <ReviewStep
      state={state}
      estimate={estimate}
      onEdit={() => {}}
      onAgreedChange={() => {}}
      onRecurringConsentChange={onConsent}
      submission={{ status: "idle" }}
      onSubmit={onSubmit}
      onPickNewDate={() => {}}
      onRedoPayment={() => {}}
      honeypot=""
      onHoneypotChange={() => {}}
      onBack={() => {}}
    />,
  );
}

describe("Booking introduction", () => {
  it("does not claim that no appointment is created or saved", () => {
    render(<IntroStep onStart={() => {}} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/no appointment is\s+created/i);
    expect(text).not.toMatch(/no information is saved/i);
    expect(text).not.toMatch(/preview of/i);
    expect(text).toMatch(/creates your appointment request/i);
    expect(text).toMatch(/not charged until one hour after your cleaning ends/i);
  });
});

describe("Review step — what the customer is shown", () => {
  it("a recurring initial booking shows 'First cleaning total' at the regular price, the explicit notice, and a labeled ongoing estimate", () => {
    renderReview(completeState({ frequency: "weekly" }));
    expect(screen.getByText("First cleaning total")).toBeTruthy();
    expect(screen.getByText("$165")).toBeTruthy(); // regular price — never the discounted figure
    expect(screen.getByText(FIRST_CLEANING_NOTICE)).toBeTruthy();
    expect(screen.getByText(/Estimated total for later cleanings: \$145\.50 each, if your cleaning details stay the same\./)).toBeTruthy();
    expect(screen.queryByText("Estimated total")).toBeNull();
  });

  it("the notice describes AUTOMATIC scheduling and no longer asks the customer to rebook through a link", () => {
    renderReview(completeState({ frequency: "biweekly" }));
    const text = document.body.textContent ?? "";
    expect(text).toContain("we schedule your next cleaning automatically");
    expect(text).not.toMatch(/book your next cleaning/i);
    expect(text).not.toMatch(/future visits are booked separately/i);
  });

  it("shows the discount as starting after the first cleaning in the Frequency section", () => {
    renderReview(completeState({ frequency: "monthly" }));
    expect(screen.getByText("5% discount, after your first cleaning")).toBeTruthy();
  });

  it("a one-time booking is unchanged: 'Estimated total', no recurring notice or consent", () => {
    renderReview(completeState({ frequency: "one-time" }));
    expect(screen.getByText("Estimated total")).toBeTruthy();
    expect(screen.getByText("$165")).toBeTruthy();
    expect(screen.queryByText(/first cleaning is charged/i)).toBeNull();
    expect(screen.queryByText(RECURRING_CONSENT_TEXT)).toBeNull();
  });
});

describe("Recurring consent", () => {
  it("is required for a recurring booking: Submit stays disabled until the consent box is ticked", () => {
    renderReview(completeState({ frequency: "weekly", recurringConsent: false }));
    const submit = screen.getByRole("button", { name: /submit booking request/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(RECURRING_CONSENT_TEXT)).toBeTruthy();
  });

  it("enables Submit once consent is given", () => {
    renderReview(completeState({ frequency: "weekly", recurringConsent: true }));
    const submit = screen.getByRole("button", { name: /submit booking request/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("reports the checkbox change to the flow", () => {
    const onConsent = vi.fn();
    renderReview(completeState({ frequency: "weekly", recurringConsent: false }), () => {}, onConsent);
    fireEvent.click(screen.getByRole("checkbox", { name: /authorize BeLa Cleaning to automatically schedule/i }));
    expect(onConsent).toHaveBeenCalledWith(true);
  });

  it("a one-time booking never needs it", () => {
    renderReview(completeState({ frequency: "one-time", recurringConsent: false }));
    const submit = screen.getByRole("button", { name: /submit booking request/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });
});

describe("Frequency selector", () => {
  it("states the arrangement and labels each discount as starting after the first cleaning", () => {
    render(<FrequencyStep value={null} onSelect={() => {}} onBack={() => {}} />);
    expect(document.body.textContent).toContain(FIRST_CLEANING_NOTICE);
    expect(screen.getByRole("radio", { name: /Weekly/ }).textContent).toContain("15% discount after your first cleaning");
    expect(screen.getByRole("radio", { name: /Every other week/ }).textContent).toContain("10% discount after your first cleaning");
    expect(screen.getByRole("radio", { name: /One time/ }).textContent).not.toContain("discount");
  });
});

describe("Confirmation page", () => {
  const base = {
    bookingId: "BELA-20261201-ABCDEF",
    serviceDate: "2026-12-01",
    serviceStartTime: "9:00 AM",
    totalPrice: 165,
    estimatedDurationMinutes: 225,
  };
  const firstCleaning = {
    ...base,
    saved: { cleaningType: "Standard cleaning", frequency: "Weekly", frequencyDiscount: 0, quoteKind: "first-cleaning" as const },
  };
  const oneTime = {
    ...base,
    saved: { cleaningType: "Standard cleaning", frequency: "One time", frequencyDiscount: 0, quoteKind: "one-time" as const },
  };

  it("an initial recurring booking is labelled 'First cleaning total' and gets the explicit notice", () => {
    render(<BookingConfirmation state={completeState({ frequency: "weekly" })} submission={firstCleaning} />);
    expect(screen.getByText("First cleaning total")).toBeTruthy();
    expect(screen.getByText("$165")).toBeTruthy();
    expect(screen.getByText(FIRST_CLEANING_NOTICE)).toBeTruthy();
  });

  it("is unchanged for a one-time booking", () => {
    render(<BookingConfirmation state={completeState({ frequency: "one-time" })} submission={oneTime} />);
    expect(screen.getByText("Estimated total")).toBeTruthy();
    expect(screen.queryByText(/first cleaning is charged/i)).toBeNull();
  });

  it("describes the SAVED booking even when the browser's form state has since changed", () => {
    render(<BookingConfirmation state={completeState({ frequency: "monthly", cleaningType: "deep" })} submission={firstCleaning} />);
    expect(screen.getByText("Weekly")).toBeTruthy();
    expect(screen.queryByText("Monthly")).toBeNull();
    expect(screen.getByText("Standard cleaning")).toBeTruthy();
    expect(screen.getByText("$165")).toBeTruthy();
    expect(screen.getByText("First cleaning total")).toBeTruthy();
  });
});

describe("Booking flow", () => {
  const pick = (name: RegExp) => fireEvent.click(screen.getByRole("radio", { name }));

  it("quotes the regular price for a recurring selection and never asks the server about a follow-up link", () => {
    // The date is the first question; freeze Date so a known day is selectable.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 10, 10, 0, 0));
    const fetchMock = vi.fn((_url: string) => Promise.resolve({ json: () => Promise.resolve({ ok: true, unavailableDateKeys: [] }) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    render(<BookingFlow />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    fireEvent.click(screen.getByRole("button", { name: "Monday, June 22, 2026" }));
    pick(/^Apartment$/);
    pick(/^2 bedrooms/);
    pick(/^2 bathrooms/);
    pick(/^Standard cleaning/);
    fireEvent.click(screen.getByRole("button", { name: "No extras" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    pick(/^1,001–2,000 sq\. ft\./);
    pick(/^Weekly/);
    expect(screen.getAllByText("$165").length).toBeGreaterThan(0);
    expect(screen.queryByText("$145.50")).toBeNull();
    expect(screen.getAllByText("First cleaning total").length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("follow-up"))).toBe(false);
    vi.useRealTimers();
  });
});

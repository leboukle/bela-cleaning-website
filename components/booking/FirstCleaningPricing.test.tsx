// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import BookingFlow from "./BookingFlow";
import BookingConfirmation from "./BookingConfirmation";
import ReviewStep from "./steps/ReviewStep";
import FrequencyStep from "./steps/FrequencyStep";
import { calculateEstimate } from "@/lib/booking/calculate";
import { initialBookingState, initialExtrasState, type BookingState } from "@/lib/booking/types";

beforeEach(() => {
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOTICE = (frequency: string) =>
  `Your first cleaning is charged at the regular price. Your ${frequency} discount starts with your second cleaning.`;

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

function renderReview(state: BookingState, discountApplied = false) {
  const estimate = calculateEstimate({ ...state, applyFrequencyDiscount: discountApplied });
  render(
    <ReviewStep
      state={state}
      estimate={estimate}
      onEdit={() => {}}
      onAgreedChange={() => {}}
      submission={{ status: "idle" }}
      onSubmit={() => {}}
      followUpDiscountApplied={discountApplied}
      onPickNewDate={() => {}}
      onRedoPayment={() => {}}
      honeypot=""
      onHoneypotChange={() => {}}
      onBack={() => {}}
    />,
  );
}

describe("Review step — what the customer is shown", () => {
  it("a recurring FIRST cleaning shows 'First cleaning total' at the regular price, the policy notice, and a labeled ongoing estimate", () => {
    renderReview(completeState({ frequency: "weekly" }));
    expect(screen.getByText("First cleaning total")).toBeTruthy();
    expect(screen.getByText("$165")).toBeTruthy(); // regular price — never the discounted figure
    expect(screen.getByText(NOTICE("weekly"))).toBeTruthy();
    // The ongoing figure is labelled as later cleanings, not presented as this appointment's charge.
    expect(screen.getByText(/Estimated total for later cleanings: \$145\.50 each, if your cleaning details stay the same\./)).toBeTruthy();
    expect(screen.queryByText("Estimated total")).toBeNull();
  });

  it("uses the selected frequency's own wording in the notice", () => {
    renderReview(completeState({ frequency: "biweekly" }));
    expect(screen.getByText(NOTICE("every other week"))).toBeTruthy();
  });

  it("states that the discount begins with the second cleaning in the Frequency section", () => {
    renderReview(completeState({ frequency: "monthly" }));
    expect(screen.getByText("5% discount, from your 2nd cleaning")).toBeTruthy();
  });

  it("a one-time booking is unchanged: 'Estimated total', no recurring notice, no ongoing estimate", () => {
    renderReview(completeState({ frequency: "one-time" }));
    expect(screen.getByText("Estimated total")).toBeTruthy();
    expect(screen.getByText("$165")).toBeTruthy();
    expect(screen.queryByText(/first cleaning is charged/i)).toBeNull();
    expect(screen.queryByText(/later cleanings/i)).toBeNull();
  });

  it("a qualifying follow-up shows the discounted amount as the amount for THIS appointment, with an 'applied' note", () => {
    renderReview(completeState({ frequency: "weekly" }), true);
    expect(screen.getByText("$145.50")).toBeTruthy();
    expect(screen.getByText("Estimated total")).toBeTruthy();
    expect(screen.getByText("Your weekly discount is applied to this cleaning.")).toBeTruthy();
    expect(screen.queryByText("First cleaning total")).toBeNull();
    expect(screen.queryByText(/later cleanings/i)).toBeNull();
  });
});

describe("Frequency selector", () => {
  it("explains the policy and labels each discount as starting with the 2nd cleaning", () => {
    render(<FrequencyStep value={null} onSelect={() => {}} onBack={() => {}} />);
    expect(
      screen.getByText("Your first cleaning is charged at the regular price. Your discount starts with your second cleaning."),
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Weekly/ }).textContent).toContain("15% discount from your 2nd cleaning");
    expect(screen.getByRole("radio", { name: /Every other week/ }).textContent).toContain("10% discount from your 2nd cleaning");
    expect(screen.getByRole("radio", { name: /One time/ }).textContent).not.toContain("discount");
  });

  it("tells a follow-up customer their discount applies, and explains an unconfirmed first cleaning rather than promising it", () => {
    const { rerender } = render(
      <FrequencyStep value={null} onSelect={() => {}} onBack={() => {}} followUp={{ status: "eligible" }} />,
    );
    expect(screen.getByText(/follow-up cleaning, so your recurring discount applies to this visit/i)).toBeTruthy();

    rerender(
      <FrequencyStep
        value={null}
        onSelect={() => {}}
        onBack={() => {}}
        followUp={{ status: "ineligible", reason: "first-cleaning-not-completed" }}
      />,
    );
    expect(screen.getByText(/first cleaning hasn't been marked completed.*regular price/i)).toBeTruthy();
  });
});

describe("Confirmation page", () => {
  const submission = {
    bookingId: "BELA-20261201-ABCDEF",
    serviceDate: "2026-12-01",
    serviceStartTime: "9:00 AM",
    totalPrice: 165,
    estimatedDurationMinutes: 225,
  };

  it("labels the amount 'First cleaning total' and repeats the notice plus how to book the discounted follow-up", () => {
    render(<BookingConfirmation state={completeState({ frequency: "weekly" })} submission={submission} />);
    expect(screen.getByText("First cleaning total")).toBeTruthy();
    expect(screen.getByText("$165")).toBeTruthy();
    expect(screen.getByText(/Your first cleaning is charged at the regular price\. Your weekly discount starts with your second cleaning\./)).toBeTruthy();
    expect(screen.getByText(/Book your next cleaning/)).toBeTruthy();
  });

  it("is unchanged for a one-time booking", () => {
    render(<BookingConfirmation state={completeState({ frequency: "one-time" })} submission={submission} />);
    expect(screen.getByText("Estimated total")).toBeTruthy();
    expect(screen.queryByText(/first cleaning is charged/i)).toBeNull();
  });
});

describe("Booking flow with a follow-up link", () => {
  function stubFetch(eligibility: { ok: boolean; eligible?: boolean; reason?: string }) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        calls.push(String(url));
        return Promise.resolve({ json: () => Promise.resolve(eligibility) } as Response);
      }),
    );
    return calls;
  }

  const pick = (name: RegExp) => fireEvent.click(screen.getByRole("radio", { name }));

  async function walkToFrequencyAndChooseWeekly() {
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    pick(/^Apartment$/);
    pick(/^2 bedrooms/);
    pick(/^2 bathrooms/);
    pick(/^Standard cleaning/);
    fireEvent.click(screen.getByRole("button", { name: "No extras" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    pick(/^1,001–2,000 sq\. ft\./);
    pick(/^Weekly/);
  }

  it("without a link: the quote is the regular first-cleaning price", async () => {
    const calls = stubFetch({ ok: true });
    render(<BookingFlow />);
    await walkToFrequencyAndChooseWeekly();
    expect(screen.getAllByText("$165").length).toBeGreaterThan(0);
    expect(screen.queryByText("$145.50")).toBeNull();
    expect(screen.getAllByText("First cleaning total").length).toBeGreaterThan(0);
    expect(calls.some((c) => c.includes("follow-up-eligibility"))).toBe(false);
  });

  it("with a link the server confirms: the quote shows the discounted amount for this appointment", async () => {
    const calls = stubFetch({ ok: true, eligible: true });
    render(<BookingFlow followUpToken={"T".repeat(43)} />);
    await waitFor(() => expect(calls.some((c) => c.includes("follow-up-eligibility?token="))).toBe(true));
    await walkToFrequencyAndChooseWeekly();
    await waitFor(() => expect(screen.getAllByText("$145.50").length).toBeGreaterThan(0));
    expect(screen.queryByText("First cleaning total")).toBeNull();
  });

  it("with a link the server does NOT confirm: the quote stays at the regular price and the customer is told why", async () => {
    stubFetch({ ok: true, eligible: false, reason: "first-cleaning-not-completed" });
    render(<BookingFlow followUpToken={"T".repeat(43)} />);
    fireEvent.click(await screen.findByRole("button", { name: /get started/i }));
    pick(/^Apartment$/);
    pick(/^2 bedrooms/);
    pick(/^2 bathrooms/);
    pick(/^Standard cleaning/);
    fireEvent.click(screen.getByRole("button", { name: "No extras" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    pick(/^1,001–2,000 sq\. ft\./);
    await waitFor(() => expect(screen.getByText(/hasn't been marked completed/i)).toBeTruthy());
    pick(/^Weekly/);
    expect(screen.getAllByText("$165").length).toBeGreaterThan(0);
    expect(screen.queryByText("$145.50")).toBeNull();
  });
});

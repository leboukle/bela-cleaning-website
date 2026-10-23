// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// The Stripe step is exercised in PaymentStep.test.tsx; here it only needs to complete.
vi.mock("./steps/PaymentStep", () => ({
  default: ({ onSetupComplete, onBack }: { onSetupComplete: (id: string) => void; onBack: () => void }) => (
    <div>
      <button type="button" onClick={onBack}>
        Back
      </button>
      <h1>Payment method</h1>
      <button type="button" onClick={() => onSetupComplete("seti_test")}>
        Mock payment done
      </button>
    </div>
  ),
}));

import BookingFlow from "./BookingFlow";

const TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

beforeEach(() => {
  window.scrollTo = vi.fn();
  if (!globalThis.crypto?.randomUUID) {
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000000" });
  }
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 10, 10, 0, 0));
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = String(url).includes("available-times")
        ? { ok: true, availableStartTimes: TIMES }
        : { ok: true, unavailableDateKeys: [] };
      return Promise.resolve({ json: () => Promise.resolve(body) } as Response);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const heading = () => screen.getByRole("heading", { level: 1 }).textContent ?? "";
const pick = (name: RegExp) => fireEvent.click(screen.getByRole("radio", { name }));
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));

async function walkToReview() {
  render(<BookingFlow />);
  fireEvent.click(screen.getByRole("button", { name: /get started/i }));
  fireEvent.click(screen.getByRole("button", { name: "Monday, June 22, 2026" }));
  pick(/^Apartment$/);
  pick(/^2 bedrooms/);
  pick(/^2 bathrooms/);
  pick(/^Standard cleaning/);
  fireEvent.click(screen.getByRole("button", { name: "No extras" }));
  next();
  pick(/^1,001–2,000 sq\. ft\./);
  pick(/^One time/);
  type("ZIP code", "07030");
  next();
  fireEvent.click(await screen.findByRole("radio", { name: "10:00 AM" }));
  type("First name", "Jane");
  type("Last name", "Doe");
  next();
  type("Email address", "jane@example.com");
  next();
  type("Mobile phone number", "5551234567");
  next();
  type("Street address", "123 Main St");
  type("City", "Hoboken");
  type("ZIP code", "07030");
  next();
  pick(/^Yes, someone will be home/);
  next(); // special instructions
  fireEvent.click(screen.getByRole("button", { name: "Mock payment done" }));
  expect(heading()).toMatch(/review/i);
}

const reviewValue = (label: string) => {
  // Scoped to the Review sections: the label also appears in the running summary.
  const rows = screen.getAllByText(label).filter((el) => el.closest("section"));
  return rows[0]?.nextElementSibling?.textContent ?? "";
};
const editButtonFor = (title: string) =>
  screen.getByRole("heading", { name: title }).parentElement?.querySelector("button") as HTMLButtonElement;

describe("Review: changing the appointment date (date is asked first, time later)", () => {
  it("a new date goes to the time step for this cleaning, then straight back to Review with everything else intact", async () => {
    await walkToReview();
    expect(reviewValue("Appointment date")).toContain("June 22, 2026");
    expect(reviewValue("Appointment time")).toBe("10:00 AM");

    fireEvent.click(editButtonFor("Appointment"));
    expect(heading()).toBe("First, choose your preferred cleaning date.");
    fireEvent.click(screen.getByRole("button", { name: "Tuesday, June 23, 2026" }));

    // The old time is cleared and a time for the new date is required.
    expect(heading()).toBe("What time works best?");
    fireEvent.click(await screen.findByRole("radio", { name: "1:00 PM" }));

    expect(heading()).toMatch(/review/i);
    expect(reviewValue("Appointment date")).toContain("June 23, 2026");
    expect(reviewValue("Appointment time")).toBe("1:00 PM");
    expect(reviewValue("Name")).toBe("Jane Doe");
    expect(reviewValue("Service area")).toContain("07030");
  });

  it("keeping the same date returns straight to Review with the time intact", async () => {
    await walkToReview();
    fireEvent.click(editButtonFor("Appointment"));
    fireEvent.click(screen.getByRole("button", { name: "Monday, June 22, 2026" }));
    expect(heading()).toMatch(/review/i);
    expect(reviewValue("Appointment time")).toBe("10:00 AM");

    // The edit is finished: walking Back through the flow must not leave a stale
    // "return to Review" that skips the Payment step on the way forward again.
    fireEvent.click(screen.getByRole("button", { name: /back/i })); // payment
    fireEvent.click(screen.getByRole("button", { name: /back/i })); // special instructions
    expect(heading()).toBe("Is there anything else you'd like us to know?");
    next();
    expect(heading()).toBe("Payment method");
  });

  it("Back from the date step returns to Review, not the intro", async () => {
    await walkToReview();
    fireEvent.click(editButtonFor("Appointment"));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(heading()).toMatch(/review/i);
    expect(reviewValue("Appointment date")).toContain("June 22, 2026");
  });

  it("editing the service area returns straight to Review", async () => {
    await walkToReview();
    fireEvent.click(editButtonFor("Service Area"));
    expect(heading()).toBe("Where would you like us to clean?");
    next();
    expect(heading()).toMatch(/review/i);
  });
});

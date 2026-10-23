// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import BookingFlow from "./BookingFlow";
import { EDIT_GROUPS, EDIT_GROUP_END_STEPS, STEP_STAGE, PROGRESS_STAGES } from "@/lib/booking/config";
import { STEP_ORDER } from "@/lib/booking/types";

beforeEach(() => {
  window.scrollTo = vi.fn();
  if (!globalThis.crypto?.randomUUID) {
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000000" });
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const DATE_A_LABEL = "Monday, June 22, 2026";
const DATE_B_LABEL = "Tuesday, June 23, 2026";
const TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

const H = {
  date: "First, choose your preferred cleaning date.",
  property: "First, tell us about your property.",
  bedrooms: "How many bedrooms should we plan for?",
  bathrooms: "And how many bathrooms?",
  cleaningType: "What kind of clean would you like?",
  extras: "Would you like us to take care of anything extra?",
  squareFootage: "How much space should we plan for?",
  frequency: "How often should we come by?",
  location: "Where would you like us to clean?",
} as const;

function currentHeading(): string {
  return screen.getByRole("heading", { level: 1 }).textContent ?? "";
}

function pick(name: RegExp) {
  fireEvent.click(screen.getByRole("radio", { name }));
}

function goBack() {
  fireEvent.click(screen.getByRole("button", { name: /back/i }));
}

// The date is the FIRST question now. Freeze only Date so the calendar is deterministic
// (earliest bookable day = June 15) and serve a fixed availability response.
function freezeCalendarAndAvailability(options: { times?: string[] } = {}) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 10, 10, 0, 0));
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = String(url).includes("available-times")
        ? { ok: true, availableStartTimes: options.times ?? TIMES }
        : { ok: true, unavailableDateKeys: [] };
      return Promise.resolve({ json: () => Promise.resolve(body) } as Response);
    }),
  );
}

function startAndAnswerThrough(stopBefore: keyof typeof H) {
  if (!vi.isFakeTimers()) freezeCalendarAndAvailability();
  render(<BookingFlow />);
  fireEvent.click(screen.getByRole("button", { name: /get started/i }));
  const sequence: Array<[keyof typeof H, () => void]> = [
    ["date", () => fireEvent.click(screen.getByRole("button", { name: DATE_A_LABEL }))],
    ["property", () => pick(/^Apartment$/)],
    ["bedrooms", () => pick(/^2 bedrooms/)],
    ["bathrooms", () => pick(/^2 bathrooms/)],
    ["cleaningType", () => pick(/^Standard cleaning/)],
    [
      "extras",
      () => {
        fireEvent.click(screen.getByRole("button", { name: "No extras" }));
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      },
    ],
    ["squareFootage", () => pick(/^1,001–2,000 sq\. ft\./)],
    ["frequency", () => pick(/^One time/)],
  ];
  for (const [key, answer] of sequence) {
    if (key === stopBefore) return;
    expect(currentHeading()).toBe(H[key]);
    answer();
  }
}

describe("booking step order", () => {
  it("STEP_ORDER asks the date first, then Property → Bedrooms → Bathrooms → Cleaning Type → Extras → Square Footage → Frequency, then the unchanged later steps", () => {
    expect([...STEP_ORDER]).toEqual([
      "intro",
      "schedule-date",
      "property-type",
      "bedrooms",
      "bathrooms",
      "cleaning-type",
      "extras",
      "square-footage",
      "frequency",
      "location",
      "arrival-window",
      "customer-name",
      "customer-email",
      "customer-phone",
      "service-address",
      "access",
      "special-instructions",
      "payment",
      "review",
    ]);
  });

  it("every step has a progress stage that only ever moves forward through PROGRESS_STAGES", () => {
    let lastIndex = -1;
    for (const step of STEP_ORDER) {
      const stage = STEP_STAGE[step];
      if (!stage) continue; // "intro" has no stage
      const index = PROGRESS_STAGES.indexOf(stage as (typeof PROGRESS_STAGES)[number]);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = index;
    }
  });

  it("each Review edit group covers a contiguous run of steps, and 'Property' no longer swallows square footage", () => {
    for (const group of EDIT_GROUPS) {
      const start = STEP_ORDER.indexOf(group.startStep);
      const end = STEP_ORDER.indexOf(group.endStep);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThanOrEqual(start);
    }
    const property = EDIT_GROUPS.find((g) => g.id === "property");
    expect(property?.endStep).toBe("property-type");
    const squareFootage = EDIT_GROUPS.find((g) => g.id === "square-footage");
    expect(squareFootage).toMatchObject({ startStep: "square-footage", endStep: "square-footage" });
    expect(EDIT_GROUP_END_STEPS.has("square-footage")).toBe(true);
  });
});

describe("BookingFlow: date first", () => {
  beforeEach(() => {
    freezeCalendarAndAvailability();
  });

  const checkedTimes = () => screen.queryAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true");

  function fillZipAndContinue() {
    fireEvent.change(screen.getByLabelText("ZIP code"), { target: { value: "07030" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  }

  it("shows the calendar immediately after 'Let's Get Started', before any property question, with no closure notice", () => {
    render(<BookingFlow />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(currentHeading()).toBe(H.date);
    expect(screen.queryByText(/not accepting new cleaning appointments/i)).toBeNull();
    expect(screen.queryByText(/remainder of 2026/i)).toBeNull();
  });

  it("keeps unavailable dates visible but disabled, and does not skip ahead to a later month", async () => {
    vi.setSystemTime(new Date(2026, 9, 22, 10, 0, 0)); // Oct 22, 2026: the restricted period starts today
    render(<BookingFlow />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    // The first month shown is the earliest bookable month, not January.
    expect(screen.getByText("October 2026")).toBeTruthy();
    const nov = () => screen.getByRole("button", { name: /Next month/i });
    fireEvent.click(nov());
    expect(screen.getByText("November 2026")).toBeTruthy();

    const closed = screen.getByRole("button", { name: /Monday, November 16, 2026/ }) as HTMLButtonElement;
    expect(closed.disabled).toBe(true);
    expect(closed.getAttribute("aria-label")).toMatch(/unavailable/i);
    fireEvent.click(closed);
    expect(currentHeading()).toBe(H.date); // cannot be selected

    // Navigation to future months stays possible, and January 2027 dates are selectable.
    fireEvent.click(nov()); // December
    fireEvent.click(nov()); // January
    expect(screen.getByText("January 2027")).toBeTruthy();
    const jan = screen.getByRole("button", { name: /Tuesday, January 12, 2027/ }) as HTMLButtonElement;
    expect(jan.disabled).toBe(false);
    fireEvent.click(jan);
    expect(currentHeading()).toBe(H.property);
  });

  it("preserves the selected date through Back navigation", () => {
    startAndAnswerThrough("property");
    expect(currentHeading()).toBe(H.property);
    goBack();
    expect(currentHeading()).toBe(H.date);
    expect(screen.getByRole("button", { name: DATE_A_LABEL }).getAttribute("aria-current")).toBe("date");
    fireEvent.click(screen.getByRole("button", { name: DATE_A_LABEL }));
    expect(currentHeading()).toBe(H.property);
  });

  it("picks the start time AFTER the cleaning's duration is known, for the date chosen first", async () => {
    startAndAnswerThrough("location");
    fillZipAndContinue();
    expect(currentHeading()).toBe("What time works best?");
    const urls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    const timesCall = urls.find((u) => u.includes("available-times")) ?? "";
    expect(timesCall).toContain("date=2026-06-22");
    expect(timesCall).toMatch(/durationMinutes=\d+/);
    fireEvent.click(await screen.findByRole("radio", { name: "10:00 AM" }));
    expect(currentHeading()).toBe("What should we call you?");
  });

  it("when no time fits, explains it and lets the customer change the date without losing entered details", async () => {
    startAndAnswerThrough("location");
    fillZipAndContinue();
    // Date A has no start times for this cleaning; Date B does.
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      const body = String(url).includes("available-times")
        ? { ok: true, availableStartTimes: String(url).includes("2026-06-23") ? TIMES : [] }
        : { ok: true, unavailableDateKeys: [] };
      return Promise.resolve({ json: () => Promise.resolve(body) } as Response);
    });
    // Re-enter the time step so it re-fetches with the new stub.
    goBack();
    fillZipAndContinue();
    expect(await screen.findByText(/No start times are available on this date for a cleaning of this length/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Choose a different date" }));
    expect(currentHeading()).toBe(H.date);
    fireEvent.click(screen.getByRole("button", { name: DATE_B_LABEL }));

    // Straight back to the time step, now with times for the new date.
    expect(currentHeading()).toBe("What time works best?");
    expect(await screen.findByRole("radio", { name: "10:00 AM" })).toBeTruthy();
    expect(checkedTimes()).toHaveLength(0);

    // Everything entered earlier is still there.
    goBack();
    expect((screen.getByLabelText("ZIP code") as HTMLInputElement).value).toBe("07030");
    goBack();
    expect(screen.getByRole("radio", { name: /^One time/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("Back from the date step while changing the date returns to the time step, not the intro", async () => {
    startAndAnswerThrough("location");
    fillZipAndContinue();
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ json: () => Promise.resolve({ ok: true, availableStartTimes: [], unavailableDateKeys: [] }) } as Response),
    );
    goBack();
    fillZipAndContinue();
    fireEvent.click(await screen.findByRole("button", { name: "Choose a different date" }));
    expect(currentHeading()).toBe(H.date);
    goBack();
    expect(currentHeading()).toBe("What time works best?");
  });
});

describe("BookingFlow navigation", () => {
  it("presents the questions in the new order", () => {
    startAndAnswerThrough("location");
    expect(currentHeading()).toBe(H.location);
  });

  it("asks square footage after Extras and before Frequency", () => {
    startAndAnswerThrough("squareFootage");
    expect(currentHeading()).toBe(H.squareFootage);
    pick(/^1,001–2,000 sq\. ft\./);
    expect(currentHeading()).toBe(H.frequency);
  });

  it("navigating Back and forward preserves every selection", () => {
    startAndAnswerThrough("location");

    // Back to Frequency, Square Footage, Extras, ... and check each remembered answer.
    goBack();
    expect(currentHeading()).toBe(H.frequency);
    expect(screen.getByRole("radio", { name: /^One time/ }).getAttribute("aria-checked")).toBe("true");

    goBack();
    expect(currentHeading()).toBe(H.squareFootage);
    expect(screen.getByRole("radio", { name: /^1,001–2,000 sq\. ft\./ }).getAttribute("aria-checked")).toBe("true");

    goBack();
    expect(currentHeading()).toBe(H.extras);
    expect(screen.getByRole("button", { name: "No extras" }).getAttribute("aria-pressed")).toBe("true");

    goBack();
    expect(currentHeading()).toBe(H.cleaningType);
    expect(screen.getByRole("radio", { name: /^Standard cleaning/ }).getAttribute("aria-checked")).toBe("true");

    goBack();
    expect(currentHeading()).toBe(H.bathrooms);
    expect(screen.getByRole("radio", { name: /^2 bathrooms/ }).getAttribute("aria-checked")).toBe("true");

    goBack();
    expect(currentHeading()).toBe(H.bedrooms);
    expect(screen.getByRole("radio", { name: /^2 bedrooms/ }).getAttribute("aria-checked")).toBe("true");

    goBack();
    expect(currentHeading()).toBe(H.property);
    expect(screen.getByRole("radio", { name: /^Apartment$/ }).getAttribute("aria-checked")).toBe("true");

    goBack();
    expect(currentHeading()).toBe(H.date);
    expect(screen.getByRole("button", { name: DATE_A_LABEL }).getAttribute("aria-current")).toBe("date");
  });

  it("re-answering square footage on the way back changes the running total but keeps every other selection", () => {
    startAndAnswerThrough("location");
    // 2 BR ($130) + 2 BA ($20) + 1,001–2,000 sq ft ($15) + Standard ($0) = $165
    expect(screen.getAllByText("$165").length).toBeGreaterThan(0);

    goBack(); // Frequency
    goBack(); // Square Footage
    pick(/^3,001–4,000 sq\. ft\./); // advances to Frequency
    expect(currentHeading()).toBe(H.frequency);
    pick(/^One time/);
    // $130 + $20 + $35 = $185
    expect(screen.getAllByText("$185").length).toBeGreaterThan(0);

    // Location -> Frequency -> Square Footage -> Extras -> Cleaning Type
    goBack();
    goBack();
    goBack();
    goBack();
    expect(currentHeading()).toBe(H.cleaningType);
    expect(screen.getByRole("radio", { name: /^Standard cleaning/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("shows each square-footage tier's price and duration on its card, and no instant price for >4,000 sq ft", () => {
    startAndAnswerThrough("squareFootage");
    const card = (name: RegExp) => screen.getByRole("radio", { name }).textContent ?? "";
    // Up to 1,000: +$0 / +0 min (shown as "Included", no duration).
    expect(card(/^Up to 1,000/)).toContain("Included");
    expect(card(/^Up to 1,000/)).not.toContain("min");
    // 1,001–2,000: +$15 / +15 min
    expect(card(/^1,001–2,000/)).toContain("+$15");
    expect(card(/^1,001–2,000/)).toContain("+15 min");
    // 2,001–3,000: +$25 / +20 min
    expect(card(/^2,001–3,000/)).toContain("+$25");
    expect(card(/^2,001–3,000/)).toContain("+20 min");
    // 3,001–4,000: +$35 / +25 min
    expect(card(/^3,001–4,000/)).toContain("+$35");
    expect(card(/^3,001–4,000/)).toContain("+25 min");
    expect(card(/^More than 4,000/)).not.toContain("$");
  });

  it(">4,000 sq ft stops standard online booking with the existing custom-estimate notice", () => {
    startAndAnswerThrough("squareFootage");
    pick(/^More than 4,000/);
    expect(screen.getByText(/bit larger than we can price instantly/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /request a custom estimate/i })).toBeTruthy();
    // "Change your answer" returns to the question with the flow intact.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /change your answer/i }));
    });
    expect(currentHeading()).toBe(H.squareFootage);
  });
});

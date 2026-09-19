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
});

const H = {
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

function startAndAnswerThrough(stopBefore: keyof typeof H) {
  render(<BookingFlow />);
  fireEvent.click(screen.getByRole("button", { name: /get started/i }));
  const sequence: Array<[keyof typeof H, () => void]> = [
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
  it("STEP_ORDER asks Property → Bedrooms → Bathrooms → Cleaning Type → Extras → Square Footage → Frequency, then the unchanged later steps", () => {
    expect([...STEP_ORDER]).toEqual([
      "intro",
      "property-type",
      "bedrooms",
      "bathrooms",
      "cleaning-type",
      "extras",
      "square-footage",
      "frequency",
      "location",
      "schedule-date",
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

describe("BookingFlow: changing the appointment date", () => {
  const DATE_A_LABEL = "Monday, June 22, 2026";
  const DATE_B_LABEL = "Tuesday, June 23, 2026";
  const TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

  beforeEach(() => {
    // Freeze only Date so the calendar is deterministic (earliest bookable day = June 15).
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
    vi.useRealTimers();
  });

  async function chooseDateAndTime(dateLabel: string, timeLabel: string) {
    fireEvent.click(screen.getByRole("button", { name: dateLabel }));
    fireEvent.click(await screen.findByRole("radio", { name: timeLabel }));
  }

  async function walkToTimeStepWithTimeSelected() {
    startAndAnswerThrough("location");
    fireEvent.change(screen.getByLabelText("ZIP code"), { target: { value: "07030" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(currentHeading()).toBe("When would you like us to visit?");
    await chooseDateAndTime(DATE_A_LABEL, "10:00 AM");
    expect(currentHeading()).toBe("What should we call you?"); // advanced past the time step
  }

  const checkedTimes = () => screen.queryAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true");

  it("changing to a different date clears the old time: the customer must choose one for the new date", async () => {
    await walkToTimeStepWithTimeSelected();

    goBack(); // time step: the chosen time is remembered for Date A
    expect(currentHeading()).toBe("What time works best?");
    expect((await screen.findByRole("radio", { name: "10:00 AM" })).getAttribute("aria-checked")).toBe("true");

    goBack(); // date step
    expect(currentHeading()).toBe("When would you like us to visit?");
    fireEvent.click(screen.getByRole("button", { name: DATE_B_LABEL }));

    // Straight into the existing time step for Date B: times are listed, none pre-selected or carried over.
    expect(currentHeading()).toBe("What time works best?");
    expect(await screen.findByRole("radio", { name: "10:00 AM" })).toBeTruthy();
    expect(screen.getAllByRole("radio").length).toBe(TIMES.length);
    expect(checkedTimes()).toHaveLength(0);

    // Choosing a time for Date B resumes the normal flow.
    fireEvent.click(screen.getByRole("radio", { name: "11:00 AM" }));
    expect(currentHeading()).toBe("What should we call you?");
  });

  it("re-selecting the same date keeps the already-selected valid time", async () => {
    await walkToTimeStepWithTimeSelected();

    goBack(); // time step
    goBack(); // date step
    fireEvent.click(screen.getByRole("button", { name: DATE_A_LABEL })); // same date again

    expect(currentHeading()).toBe("What time works best?");
    expect((await screen.findByRole("radio", { name: "10:00 AM" })).getAttribute("aria-checked")).toBe("true");
    expect(checkedTimes()).toHaveLength(1);
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
  });

  it("re-answering square footage on the way back changes the running total but keeps every other selection", () => {
    startAndAnswerThrough("location");
    // 2 BR ($130) + 2 BA ($20) + 1,001–2,000 sq ft ($25) + Standard ($0) = $175
    expect(screen.getAllByText("$175").length).toBeGreaterThan(0);

    goBack(); // Frequency
    goBack(); // Square Footage
    pick(/^3,001–4,000 sq\. ft\./); // advances to Frequency
    expect(currentHeading()).toBe(H.frequency);
    pick(/^One time/);
    // $130 + $20 + $75 = $225
    expect(screen.getAllByText("$225").length).toBeGreaterThan(0);

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
    expect(card(/^Up to 1,000/)).toContain("Included");
    expect(card(/^1,001–2,000/)).toContain("+$25");
    expect(card(/^1,001–2,000/)).toContain("+30 min");
    expect(card(/^2,001–3,000/)).toContain("+$50");
    expect(card(/^2,001–3,000/)).toContain("+1 hr");
    expect(card(/^3,001–4,000/)).toContain("+$75");
    expect(card(/^3,001–4,000/)).toContain("+1 hr 30 min");
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

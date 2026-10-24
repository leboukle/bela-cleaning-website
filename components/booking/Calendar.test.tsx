// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Calendar from "./Calendar";
import { getNewYorkToday, toDateKey } from "@/lib/booking/schedule";

afterEach(cleanup);

const month = () => screen.getByText(/^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/).textContent;
const prev = () => screen.getByRole("button", { name: "Previous month" }) as HTMLButtonElement;
const nextMonth = () => screen.getByRole("button", { name: "Next month" }) as HTMLButtonElement;

describe("Calendar opening month", () => {
  it("opens on the current month even when the earliest bookable date is already in the next month", () => {
    // Dec 28, 2026 10:00: the 120-hour rule and the restricted period make Jan 2 the first bookable date.
    render(<Calendar selectedDateKey={null} onSelect={vi.fn()} unavailableDateKeys={[]} today={new Date(2026, 11, 28, 10, 0, 0)} />);
    expect(month()).toBe("December 2026");
    expect(prev().disabled).toBe(true); // never before the current month
    expect(nextMonth().disabled).toBe(false);
    fireEvent.click(nextMonth());
    expect(month()).toBe("January 2027");
    expect((screen.getByRole("button", { name: /Saturday, January 2, 2027/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not jump ahead when every date in the opening months is unavailable", () => {
    const unavailable: string[] = [];
    for (let d = new Date(2026, 9, 1); d < new Date(2027, 0, 1); d.setDate(d.getDate() + 1)) unavailable.push(toDateKey(d));
    render(<Calendar selectedDateKey={null} onSelect={vi.fn()} unavailableDateKeys={unavailable} today={new Date(2026, 9, 24, 10, 0, 0)} />);
    expect(month()).toBe("October 2026");
    const days = screen.getAllByRole("button").filter((b) => /\d{4}/.test(b.getAttribute("aria-label") ?? "") && !/month/i.test(b.getAttribute("aria-label") ?? ""));
    expect(days.length).toBe(31);
    expect(days.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    // The customer can still page forward to later months themselves.
    fireEvent.click(nextMonth());
    fireEvent.click(nextMonth());
    fireEvent.click(nextMonth());
    expect(month()).toBe("January 2027");
  });

  it("opens on the month of an already-selected date", () => {
    render(<Calendar selectedDateKey="2027-01-12" onSelect={vi.fn()} unavailableDateKeys={[]} today={new Date(2026, 9, 24, 10, 0, 0)} />);
    expect(month()).toBe("January 2027");
    expect(screen.getByRole("button", { name: /Tuesday, January 12, 2027/ }).getAttribute("aria-current")).toBe("date");
  });
});

describe("getNewYorkToday", () => {
  it("uses the America/New_York calendar date, not UTC", () => {
    // 03:30 UTC on Nov 1 is still the evening of Oct 31 in New York (EDT).
    const d = getNewYorkToday(new Date("2026-11-01T03:30:00Z"));
    expect(toDateKey(d)).toBe("2026-10-31");
  });

  it("follows the fall-back DST change", () => {
    // 05:30 UTC on Nov 1 = 01:30 EST (after the clocks go back) — still Nov 1.
    expect(toDateKey(getNewYorkToday(new Date("2026-11-01T05:30:00Z")))).toBe("2026-11-01");
    expect(toDateKey(getNewYorkToday(new Date("2026-12-31T04:59:00Z")))).toBe("2026-12-30");
    expect(toDateKey(getNewYorkToday(new Date("2026-12-31T05:00:00Z")))).toBe("2026-12-31");
  });
});

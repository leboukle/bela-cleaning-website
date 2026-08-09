import { describe, it, expect } from "vitest";
import {
  BOOKINGS_COLUMNS,
  BOOKINGS_FULL_RANGE,
  BOOKINGS_LAST_COLUMN_LETTER,
  BOOKINGS_SHEET_NAME,
  columnLetter,
} from "./bookingsSheetSchema";

describe("bookingsSheetSchema", () => {
  it("has exactly 44 columns with no duplicates (41 Milestone 3 + 3 Milestone 4 notification-status columns)", () => {
    expect(BOOKINGS_COLUMNS.length).toBe(44);
    expect(new Set(BOOKINGS_COLUMNS).size).toBe(44);
  });

  it("places the 3 notification-status columns at the end, after Schema Version", () => {
    expect(BOOKINGS_COLUMNS.slice(-4)).toEqual([
      "Schema Version",
      "Customer Confirmation Status",
      "Internal Notification Status",
      "Notification Attempt At",
    ]);
  });

  it("maps the new notification-status columns to AP, AQ, AR", () => {
    expect(columnLetter("Customer Confirmation Status")).toBe("AP");
    expect(columnLetter("Internal Notification Status")).toBe("AQ");
    expect(columnLetter("Notification Attempt At")).toBe("AR");
  });

  it("maps the first column to A", () => {
    expect(columnLetter(BOOKINGS_COLUMNS[0])).toBe("A");
  });

  it("wraps past Z into two-letter columns (the 27th column is AA)", () => {
    expect(columnLetter(BOOKINGS_COLUMNS[26])).toBe("AA");
  });

  it("matches the last column's letter to BOOKINGS_LAST_COLUMN_LETTER and the full range", () => {
    const lastColumn = BOOKINGS_COLUMNS[BOOKINGS_COLUMNS.length - 1];
    expect(columnLetter(lastColumn)).toBe(BOOKINGS_LAST_COLUMN_LETTER);
    expect(BOOKINGS_FULL_RANGE).toBe(`${BOOKINGS_SHEET_NAME}!A:${BOOKINGS_LAST_COLUMN_LETTER}`);
  });

  it("throws for an unknown column", () => {
    expect(() => columnLetter("Not A Real Column" as (typeof BOOKINGS_COLUMNS)[number])).toThrow();
  });
});

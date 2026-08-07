import { describe, it, expect } from "vitest";
import {
  BOOKINGS_COLUMNS,
  BOOKINGS_FULL_RANGE,
  BOOKINGS_LAST_COLUMN_LETTER,
  BOOKINGS_SHEET_NAME,
  columnLetter,
} from "./bookingsSheetSchema";

describe("bookingsSheetSchema", () => {
  it("has exactly 41 columns with no duplicates", () => {
    expect(BOOKINGS_COLUMNS.length).toBe(41);
    expect(new Set(BOOKINGS_COLUMNS).size).toBe(41);
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

import { describe, it, expect } from "vitest";
import {
  BOOKINGS_COLUMNS,
  BOOKINGS_FULL_RANGE,
  BOOKINGS_LAST_COLUMN_LETTER,
  BOOKINGS_SHEET_NAME,
  columnLetter,
} from "./bookingsSheetSchema";

describe("bookingsSheetSchema", () => {
  it("has exactly 56 columns with no duplicates (41 Milestone 3 + 3 Milestone 4 + 12 Milestone 5 columns)", () => {
    expect(BOOKINGS_COLUMNS.length).toBe(56);
    expect(new Set(BOOKINGS_COLUMNS).size).toBe(56);
  });

  it("places the 3 notification-status columns right after Schema Version", () => {
    expect(BOOKINGS_COLUMNS.slice(40, 44)).toEqual([
      "Schema Version",
      "Customer Confirmation Status",
      "Internal Notification Status",
      "Notification Attempt At",
    ]);
  });

  it("maps the notification-status columns to AP, AQ, AR", () => {
    expect(columnLetter("Customer Confirmation Status")).toBe("AP");
    expect(columnLetter("Internal Notification Status")).toBe("AQ");
    expect(columnLetter("Notification Attempt At")).toBe("AR");
  });

  it("places the 12 Milestone 5 payment columns at the end, after Notification Attempt At", () => {
    expect(BOOKINGS_COLUMNS.slice(-12)).toEqual([
      "Stripe Customer ID",
      "Stripe PaymentMethod ID",
      "Stripe SetupIntent ID",
      "Scheduled Charge At",
      "Original Booking Total",
      "Charge Amount",
      "Payment Attempt Count",
      "Last Payment Attempt At",
      "Next Payment Attempt At",
      "Payment Failure Code",
      "Manual Amount Override",
      "Manual Amount Override At",
    ]);
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

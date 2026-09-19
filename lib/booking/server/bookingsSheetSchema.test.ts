import { describe, it, expect } from "vitest";
import {
  BOOKINGS_COLUMNS,
  BOOKINGS_FULL_RANGE,
  BOOKINGS_LAST_COLUMN_LETTER,
  BOOKINGS_SHEET_NAME,
  columnLetter,
} from "./bookingsSheetSchema";

describe("bookingsSheetSchema", () => {
  it("has exactly 68 columns with no duplicates (41 M3 + 3 M4 + 12 M5 + 5 M6 + 5 M6-amendment + 1 post-verification-fix column + 1 square-footage-price column)", () => {
    expect(BOOKINGS_COLUMNS.length).toBe(68);
    expect(new Set(BOOKINGS_COLUMNS).size).toBe(68);
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

  it("places the 12 Milestone 5 payment columns right after Notification Attempt At", () => {
    expect(BOOKINGS_COLUMNS.slice(44, 56)).toEqual([
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

  it("places the 5 Milestone 6 manage-booking columns right after Manual Amount Override At", () => {
    expect(BOOKINGS_COLUMNS.slice(56, 61)).toEqual([
      "Manage Booking Token Hash",
      "Cancellation Fee Amount",
      "Rescheduled At",
      "Original Service Date",
      "Original Arrival Window",
    ]);
  });

  it("maps the Milestone 6 columns to BE through BI", () => {
    expect(columnLetter("Manage Booking Token Hash")).toBe("BE");
    expect(columnLetter("Cancellation Fee Amount")).toBe("BF");
    expect(columnLetter("Rescheduled At")).toBe("BG");
    expect(columnLetter("Original Service Date")).toBe("BH");
    expect(columnLetter("Original Arrival Window")).toBe("BI");
  });

  it("places the 5 Milestone 6 amendment columns (reminders + exact time) right after Original Arrival Window", () => {
    expect(BOOKINGS_COLUMNS.slice(61, 66)).toEqual([
      "Appointment Reminder Status",
      "Appointment Reminder Sent At",
      "Service Start Time",
      "Original Service Start Time",
      "Appointment Reminder Attempts",
    ]);
  });

  it("maps the Milestone 6 amendment columns to BJ through BN", () => {
    expect(columnLetter("Appointment Reminder Status")).toBe("BJ");
    expect(columnLetter("Appointment Reminder Sent At")).toBe("BK");
    expect(columnLetter("Service Start Time")).toBe("BL");
    expect(columnLetter("Original Service Start Time")).toBe("BM");
    expect(columnLetter("Appointment Reminder Attempts")).toBe("BN");
  });

  it("places the post-verification-fix reminder-token-hash column right after Appointment Reminder Attempts, unmoved (BO)", () => {
    expect(BOOKINGS_COLUMNS[66]).toBe("Manage Booking Reminder Token Hash");
    expect(columnLetter("Manage Booking Reminder Token Hash")).toBe("BO");
  });

  it("appends 'Square Footage Price' as the very last column (BP), leaving every existing column's position unchanged", () => {
    expect(BOOKINGS_COLUMNS.slice(-1)).toEqual(["Square Footage Price"]);
    expect(columnLetter("Square Footage Price")).toBe("BP");
    // Spot-check that pre-existing columns kept their exact letters.
    expect(columnLetter("Square Footage")).toBe("R");
    expect(columnLetter("Total Price")).toBe("AD");
    expect(columnLetter("Estimated Duration Minutes")).toBe("AE");
    expect(columnLetter("Scheduled Charge At")).toBe("AV");
    expect(columnLetter("Charge Amount")).toBe("AX");
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

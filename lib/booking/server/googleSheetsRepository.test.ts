import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./sheetsClient", () => ({
  appendRow: vi.fn(),
  getRange: vi.fn(),
  batchGetRanges: vi.fn(),
}));

import { appendRow, getRange, batchGetRanges } from "./sheetsClient";
import { GoogleSheetsBookingRepository } from "./googleSheetsRepository";
import { BOOKINGS_COLUMNS, BOOKINGS_FULL_RANGE } from "./bookingsSheetSchema";
import type { BookingRecord } from "./types";

const mockedAppendRow = vi.mocked(appendRow);
const mockedGetRange = vi.mocked(getRange);
const mockedBatchGetRanges = vi.mocked(batchGetRanges);

beforeEach(() => {
  mockedAppendRow.mockReset();
  mockedGetRange.mockReset();
  mockedBatchGetRanges.mockReset();
});

function sampleRecord(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    bookingId: "BELA-20260915-ABCDEF",
    submittedAt: "2026-09-01T00:00:00.000Z",
    bookingStatus: "Pending Payment",
    paymentStatus: "Unpaid",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    mobile: "5551234567",
    streetAddress: "123 Main St",
    apartmentOrUnit: "",
    city: "Hoboken",
    state: "New Jersey",
    zipCode: "07030",
    someoneHome: "Yes, someone will be home",
    serviceDate: "2026-09-22",
    arrivalWindow: "Morning",
    propertyType: "Apartment",
    squareFootage: "1,001–2,000 sq. ft.",
    bedrooms: "2 bedrooms",
    bathrooms: "2 bathrooms",
    cleaningType: "Standard cleaning",
    extras: "none",
    frequency: "One time",
    baseCleaningPrice: 130,
    bathroomPrice: 20,
    cleaningTypePrice: 0,
    extrasPrice: 0,
    subtotal: 150,
    frequencyDiscount: 0,
    totalPrice: 150,
    estimatedDurationMinutes: 210,
    specialInstructions: "",
    policyAccepted: true,
    submissionSource: "Website",
    stripeCheckoutSessionId: "",
    stripePaymentIntentId: "",
    paidAt: "",
    cancelledAt: "",
    completedAt: "",
    internalNotes: "idempotency_token:abc123",
    schemaVersion: 1,
    ...overrides,
  };
}

describe("GoogleSheetsBookingRepository", () => {
  it("appendBooking writes exactly one row, in BOOKINGS_COLUMNS order, to the full range", async () => {
    const repo = new GoogleSheetsBookingRepository();
    const record = sampleRecord();
    await repo.appendBooking(record);
    expect(mockedAppendRow).toHaveBeenCalledTimes(1);
    const [range, row] = mockedAppendRow.mock.calls[0];
    expect(range).toBe(BOOKINGS_FULL_RANGE);
    expect(row.length).toBe(BOOKINGS_COLUMNS.length);
    expect(row[0]).toBe(record.bookingId);
    expect(row[BOOKINGS_COLUMNS.indexOf("Total Price")]).toBe(record.totalPrice);
  });

  it("bookingIdExists returns true when the ID is present", async () => {
    mockedGetRange.mockResolvedValue([["BELA-A"], ["BELA-B"]]);
    const repo = new GoogleSheetsBookingRepository();
    expect(await repo.bookingIdExists("BELA-B")).toBe(true);
  });

  it("bookingIdExists returns false when the ID is absent", async () => {
    mockedGetRange.mockResolvedValue([["BELA-A"]]);
    const repo = new GoogleSheetsBookingRepository();
    expect(await repo.bookingIdExists("BELA-Z")).toBe(false);
  });

  it("findRecentBookingByIdempotencyToken finds a matching marker", async () => {
    mockedBatchGetRanges.mockResolvedValue([
      [["other"], ["idempotency_token:match-me"]], // Internal Notes
      [["BELA-OLD"], ["BELA-NEW"]], // Booking ID
      [["100"], ["150"]], // Total Price
      [["120"], ["210"]], // Estimated Duration Minutes
      [["2026-09-01"], ["2026-09-22"]], // Service Date
      [["Morning"], ["Afternoon"]], // Arrival Window
    ]);
    const repo = new GoogleSheetsBookingRepository();
    const found = await repo.findRecentBookingByIdempotencyToken("match-me");
    expect(found).toEqual({
      bookingId: "BELA-NEW",
      totalPrice: 150,
      estimatedDurationMinutes: 210,
      serviceDate: "2026-09-22",
      arrivalWindow: "Afternoon",
    });
  });

  it("findRecentBookingByIdempotencyToken returns null when no row matches", async () => {
    mockedBatchGetRanges.mockResolvedValue([
      [["nothing-here"]],
      [["BELA-OLD"]],
      [["100"]],
      [["120"]],
      [["2026-09-01"]],
      [["Morning"]],
    ]);
    const repo = new GoogleSheetsBookingRepository();
    expect(await repo.findRecentBookingByIdempotencyToken("missing-token")).toBeNull();
  });
});

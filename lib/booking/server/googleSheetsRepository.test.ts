import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./sheetsClient", () => ({
  appendRow: vi.fn(),
  getRange: vi.fn(),
  batchGetRanges: vi.fn(),
  updateRange: vi.fn(),
  batchUpdateRanges: vi.fn(),
}));

import { appendRow, getRange, batchGetRanges, updateRange, batchUpdateRanges } from "./sheetsClient";
import { GoogleSheetsBookingRepository } from "./googleSheetsRepository";
import { BOOKINGS_COLUMNS, BOOKINGS_FULL_RANGE } from "./bookingsSheetSchema";
import type { BookingRecord } from "./types";

const mockedAppendRow = vi.mocked(appendRow);
const mockedGetRange = vi.mocked(getRange);
const mockedBatchGetRanges = vi.mocked(batchGetRanges);
const mockedUpdateRange = vi.mocked(updateRange);
const mockedBatchUpdateRanges = vi.mocked(batchUpdateRanges);

beforeEach(() => {
  mockedAppendRow.mockReset();
  mockedGetRange.mockReset();
  mockedBatchGetRanges.mockReset();
  mockedUpdateRange.mockReset();
  mockedBatchUpdateRanges.mockReset();
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
    squareFootagePrice: 15,
    cleaningTypePrice: 0,
    extrasPrice: 0,
    subtotal: 165,
    frequencyDiscount: 0,
    totalPrice: 165,
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
    customerConfirmationStatus: "",
    internalNotificationStatus: "",
    notificationAttemptAt: "",
    stripeCustomerId: "cus_test123",
    stripePaymentMethodId: "pm_test123",
    stripeSetupIntentId: "seti_test123",
    scheduledChargeAt: "2026-09-22T18:00:00.000Z",
    originalBookingTotal: 165,
    chargeAmount: 165,
    paymentAttemptCount: 0,
    lastPaymentAttemptAt: "",
    nextPaymentAttemptAt: "",
    paymentFailureCode: "",
    manualAmountOverride: false,
    manualAmountOverrideAt: "",
    manageBookingTokenHash: "c".repeat(64),
    cancellationFeeAmount: 0,
    rescheduledAt: "",
    originalServiceDate: "",
    originalArrivalWindow: "",
    appointmentReminderStatus: "",
    appointmentReminderSentAt: "",
    appointmentReminderAttempts: 0,
    serviceStartTime: "",
    originalServiceStartTime: "",
    manageBookingReminderTokenHash: "",
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

  it("appendBooking persists the square-footage price in the last ('Square Footage Price') column", async () => {
    const repo = new GoogleSheetsBookingRepository();
    await repo.appendBooking(sampleRecord({ squareFootagePrice: 50 }));
    const [, row] = mockedAppendRow.mock.calls[0];
    expect(BOOKINGS_COLUMNS[BOOKINGS_COLUMNS.length - 1]).toBe("Square Footage Price");
    expect(row[BOOKINGS_COLUMNS.indexOf("Square Footage Price")]).toBe(50);
  });

  it("reads a historical row that predates the 'Square Footage Price' column as squareFootagePrice 0, leaving its stored totals as-is", async () => {
    // A legacy row is 67 cells wide (no Square Footage Price cell at all).
    const legacyRow = BOOKINGS_COLUMNS.slice(0, -1).map(() => "");
    legacyRow[BOOKINGS_COLUMNS.indexOf("Booking ID")] = "BELA-LEGACY";
    legacyRow[BOOKINGS_COLUMNS.indexOf("Subtotal")] = "150";
    legacyRow[BOOKINGS_COLUMNS.indexOf("Total Price")] = "150";
    legacyRow[BOOKINGS_COLUMNS.indexOf("Charge Amount")] = "150";
    mockedGetRange.mockResolvedValueOnce([["BELA-LEGACY"]]).mockResolvedValueOnce([legacyRow]);
    const repo = new GoogleSheetsBookingRepository();
    const record = await repo.getFullBookingRecord("BELA-LEGACY");
    expect(record?.squareFootagePrice).toBe(0);
    expect(record?.subtotal).toBe(150);
    expect(record?.totalPrice).toBe(150);
    expect(record?.chargeAmount).toBe(150);
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
      [["Morning"], [""]], // Arrival Window
      [[""], ["14:00"]], // Service Start Time
    ]);
    const repo = new GoogleSheetsBookingRepository();
    const found = await repo.findRecentBookingByIdempotencyToken("match-me");
    expect(found).toEqual({
      bookingId: "BELA-NEW",
      totalPrice: 150,
      estimatedDurationMinutes: 210,
      serviceDate: "2026-09-22",
      arrivalWindow: "",
      serviceStartTime: "14:00",
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
      [[""]],
    ]);
    const repo = new GoogleSheetsBookingRepository();
    expect(await repo.findRecentBookingByIdempotencyToken("missing-token")).toBeNull();
  });

  it("updateNotificationStatus writes the 3 status columns to the correct row", async () => {
    mockedGetRange.mockResolvedValue([["BELA-OLD"], ["BELA-TARGET"], ["BELA-OTHER"]]);
    const repo = new GoogleSheetsBookingRepository();
    await repo.updateNotificationStatus("BELA-TARGET", {
      customerConfirmationStatus: "Sent",
      internalNotificationStatus: "Failed",
      notificationAttemptAt: "2026-09-01T12:00:00.000Z",
    });
    expect(mockedUpdateRange).toHaveBeenCalledTimes(1);
    const [range, row] = mockedUpdateRange.mock.calls[0];
    // "BELA-TARGET" is the 2nd data row (index 1) -> sheet row 3 (header + 1-index).
    expect(range).toBe("Bookings!AP3:AR3");
    expect(row).toEqual(["Sent", "Failed", "2026-09-01T12:00:00.000Z"]);
  });

  it("updateNotificationStatus throws if the booking ID can't be found", async () => {
    mockedGetRange.mockResolvedValue([["BELA-OLD"]]);
    const repo = new GoogleSheetsBookingRepository();
    await expect(
      repo.updateNotificationStatus("BELA-MISSING", {
        customerConfirmationStatus: "Sent",
        internalNotificationStatus: "Sent",
        notificationAttemptAt: "2026-09-01T12:00:00.000Z",
      }),
    ).rejects.toThrow();
    expect(mockedUpdateRange).not.toHaveBeenCalled();
  });

  it("findBookingIdByManageTokenHash matches the original hash and returns the corresponding Booking ID", async () => {
    const hash = "d".repeat(64);
    mockedBatchGetRanges.mockResolvedValue([
      [["e".repeat(64)], [hash]], // Manage Booking Token Hash
      [[""], [""]], // Manage Booking Reminder Token Hash
      [["BELA-OLD"], ["BELA-TARGET"]], // Booking ID
    ]);
    const repo = new GoogleSheetsBookingRepository();
    expect(await repo.findBookingIdByManageTokenHash(hash)).toBe("BELA-TARGET");
  });

  it("findBookingIdByManageTokenHash returns null when no hash matches either column (unauthorized/incorrect tokens rejected)", async () => {
    mockedBatchGetRanges.mockResolvedValue([[["e".repeat(64)]], [["6".repeat(64)]], [["BELA-OLD"]]]);
    const repo = new GoogleSheetsBookingRepository();
    expect(await repo.findBookingIdByManageTokenHash("f".repeat(64))).toBeNull();
  });

  it("findBookingIdByManageTokenHash also matches a reminder-issued hash, scoped to the correct booking", async () => {
    // Post-verification fix: the 72-hour reminder embeds a second,
    // independently-minted token (never a rotation of the original) so
    // its own hash lives in a separate column — either hash on a row
    // resolves to that row's own booking ID.
    const reminderHash = "1".repeat(64);
    mockedBatchGetRanges.mockResolvedValue([
      [["a".repeat(64)], ["b".repeat(64)]], // Manage Booking Token Hash (originals — neither matches)
      [[""], [reminderHash]], // Manage Booking Reminder Token Hash — only the 2nd row has one
      [["BELA-OTHER"], ["BELA-TARGET"]], // Booking ID
    ]);
    const repo = new GoogleSheetsBookingRepository();
    expect(await repo.findBookingIdByManageTokenHash(reminderHash)).toBe("BELA-TARGET");
  });

  it("a reminder-issued hash never resolves to a different booking's row", async () => {
    const reminderHashForOther = "2".repeat(64);
    mockedBatchGetRanges.mockResolvedValue([
      [["a".repeat(64)], ["b".repeat(64)]], // Manage Booking Token Hash
      [[reminderHashForOther], [""]], // only BELA-OTHER (row 0) has this reminder hash
      [["BELA-OTHER"], ["BELA-TARGET"]], // Booking ID
    ]);
    const repo = new GoogleSheetsBookingRepository();
    expect(await repo.findBookingIdByManageTokenHash(reminderHashForOther)).toBe("BELA-OTHER");
    expect(await repo.findBookingIdByManageTokenHash(reminderHashForOther)).not.toBe("BELA-TARGET");
  });

  it("the original booking-confirmation link still resolves correctly after a reminder token has been issued for the same row", async () => {
    // Intended behavior: issuing a reminder token never invalidates the
    // original — both remain simultaneously valid for the same booking.
    const originalHash = "3".repeat(64);
    const reminderHash = "4".repeat(64);
    mockedBatchGetRanges.mockResolvedValue([
      [[originalHash]], // Manage Booking Token Hash — untouched by reminder issuance
      [[reminderHash]], // Manage Booking Reminder Token Hash — now populated
      [["BELA-TARGET"]], // Booking ID
    ]);
    const repo = new GoogleSheetsBookingRepository();
    expect(await repo.findBookingIdByManageTokenHash(originalHash)).toBe("BELA-TARGET");
    expect(await repo.findBookingIdByManageTokenHash(reminderHash)).toBe("BELA-TARGET");
  });

  it("markBookingCancelled writes Booking Status/Payment Status, Cancelled At, and Cancellation Fee Amount to the correct row", async () => {
    mockedGetRange.mockResolvedValue([["BELA-OLD"], ["BELA-TARGET"]]);
    const repo = new GoogleSheetsBookingRepository();
    await repo.markBookingCancelled("BELA-TARGET", {
      paymentStatus: "Cancellation Fee Processing",
      cancelledAt: "2026-09-10T12:00:00.000Z",
      cancellationFeeAmount: 95.25,
    });
    expect(mockedBatchUpdateRanges).toHaveBeenCalledWith([
      { range: "Bookings!C3:D3", row: ["Cancelled", "Cancellation Fee Processing"] },
      { range: "Bookings!AL3", row: ["2026-09-10T12:00:00.000Z"] },
      { range: "Bookings!BF3", row: [95.25] },
    ]);
  });

  it("updateCancellationFeeOutcome writes Payment Status and the Stripe Payment Intent ID/Paid At pair", async () => {
    mockedGetRange.mockResolvedValue([["BELA-TARGET"]]);
    const repo = new GoogleSheetsBookingRepository();
    await repo.updateCancellationFeeOutcome("BELA-TARGET", {
      paymentStatus: "Cancellation Fee Paid",
      stripePaymentIntentId: "pi_fee_123",
      paidAt: "2026-09-10T12:05:00.000Z",
    });
    expect(mockedBatchUpdateRanges).toHaveBeenCalledWith([
      { range: "Bookings!D2", row: ["Cancellation Fee Paid"] },
      { range: "Bookings!AJ2:AK2", row: ["pi_fee_123", "2026-09-10T12:05:00.000Z"] },
    ]);
  });

  it("updateBookingReschedule writes the new date/window, Scheduled Charge At, Rescheduled At, the Original pair, and the Service Start Time pair", async () => {
    mockedGetRange.mockResolvedValue([["BELA-OLD"], ["BELA-TARGET"]]);
    const repo = new GoogleSheetsBookingRepository();
    await repo.updateBookingReschedule("BELA-TARGET", {
      serviceDate: "2026-10-01",
      arrivalWindow: "",
      serviceStartTime: "14:00",
      scheduledChargeAt: "2026-10-01T22:00:00.000Z",
      rescheduledAt: "2026-09-15T09:00:00.000Z",
      originalServiceDate: "2026-09-22",
      originalArrivalWindow: "Morning",
      originalServiceStartTime: "",
    });
    expect(mockedBatchUpdateRanges).toHaveBeenCalledWith([
      { range: "Bookings!O3:P3", row: ["2026-10-01", ""] },
      { range: "Bookings!AV3", row: ["2026-10-01T22:00:00.000Z"] },
      { range: "Bookings!BG3", row: ["2026-09-15T09:00:00.000Z"] },
      { range: "Bookings!BH3:BI3", row: ["2026-09-22", "Morning"] },
      { range: "Bookings!BL3", row: ["14:00"] },
      { range: "Bookings!BM3", row: [""] },
    ]);
  });

  it("getBookingReminderState reads back the reminder-relevant fields for the matching row", async () => {
    mockedBatchGetRanges.mockResolvedValue([
      [["BELA-OLD"], ["BELA-TARGET"]], // Booking ID
      [["Pending Payment"], ["Cancelled"]], // Booking Status
      [[""], ["Retry Scheduled"]], // Appointment Reminder Status
      [["0"], ["1"]], // Appointment Reminder Attempts
      [["2026-09-01T00:00:00.000Z"], ["2026-09-22T18:00:00.000Z"]], // Scheduled Charge At
      [["120"], ["210"]], // Estimated Duration Minutes
    ]);
    const repo = new GoogleSheetsBookingRepository();
    const state = await repo.getBookingReminderState("BELA-TARGET");
    expect(state).toEqual({
      bookingId: "BELA-TARGET",
      bookingStatus: "Cancelled",
      appointmentReminderStatus: "Retry Scheduled",
      appointmentReminderAttempts: 1,
      scheduledChargeAt: "2026-09-22T18:00:00.000Z",
      estimatedDurationMinutes: 210,
    });
  });

  it("getBookingReminderState returns null when the booking ID isn't found", async () => {
    mockedBatchGetRanges.mockResolvedValue([[["BELA-OLD"]], [["Pending Payment"]], [[""]], [["0"]], [[""]], [["120"]]]);
    const repo = new GoogleSheetsBookingRepository();
    expect(await repo.getBookingReminderState("BELA-MISSING")).toBeNull();
  });

  it("updateAppointmentReminderStatus writes Status/Sent At together, and Attempts/Reminder Token Hash together", async () => {
    mockedGetRange.mockResolvedValue([["BELA-OLD"], ["BELA-TARGET"]]);
    const repo = new GoogleSheetsBookingRepository();
    await repo.updateAppointmentReminderStatus("BELA-TARGET", {
      appointmentReminderStatus: "Sent",
      appointmentReminderSentAt: "2026-09-19T12:00:00.000Z",
      appointmentReminderAttempts: 1,
      manageBookingReminderTokenHash: "1".repeat(64),
    });
    expect(mockedBatchUpdateRanges).toHaveBeenCalledWith([
      { range: "Bookings!BJ3:BK3", row: ["Sent", "2026-09-19T12:00:00.000Z"] },
      { range: "Bookings!BN3:BO3", row: [1, "1".repeat(64)] },
    ]);
  });
});

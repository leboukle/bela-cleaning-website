// SERVER-ONLY. The Google Sheets implementation of BookingRepository.
import "server-only";
import { appendRow, batchGetRanges, batchUpdateRanges, getRange, updateRange } from "./sheetsClient";
import {
  BOOKINGS_COLUMNS,
  BOOKINGS_FULL_RANGE,
  BOOKINGS_LAST_COLUMN_LETTER,
  BOOKINGS_SHEET_NAME,
  columnLetter,
  type BookingColumn,
} from "./bookingsSheetSchema";
import type { BookingRepository, IdempotentBookingResult } from "./repository";
import type { BookingPaymentState, BookingRecord, PaymentAttemptUpdate } from "./types";
import type { NotificationStatusUpdate } from "./notificationStatus";

// How many of the most recent Bookings rows to scan when looking for a
// duplicate idempotency token. Google Sheets has no index/query
// capability, so an unbounded full-history scan would get slower as the
// sheet grows; a bounded recent window is the proportionate choice for
// this milestone (a retry realistically arrives within seconds of the
// original request, never rows deep into history) — see
// docs/booking-backend.md's idempotency section for the full tradeoff.
const IDEMPOTENCY_LOOKUP_WINDOW_ROWS = 500;

function columnRange(column: (typeof BOOKINGS_COLUMNS)[number]): string {
  const letter = columnLetter(column);
  return `${BOOKINGS_SHEET_NAME}!${letter}2:${letter}`;
}

function recordToRow(record: BookingRecord): Array<string | number | boolean> {
  const valueByColumn: Record<(typeof BOOKINGS_COLUMNS)[number], string | number | boolean> = {
    "Booking ID": record.bookingId,
    "Submitted At": record.submittedAt,
    "Booking Status": record.bookingStatus,
    "Payment Status": record.paymentStatus,
    "First Name": record.firstName,
    "Last Name": record.lastName,
    Email: record.email,
    Mobile: record.mobile,
    "Street Address": record.streetAddress,
    "Apartment or Unit": record.apartmentOrUnit,
    City: record.city,
    State: record.state,
    "ZIP Code": record.zipCode,
    "Someone Home": record.someoneHome,
    "Service Date": record.serviceDate,
    "Arrival Window": record.arrivalWindow,
    "Property Type": record.propertyType,
    "Square Footage": record.squareFootage,
    Bedrooms: record.bedrooms,
    Bathrooms: record.bathrooms,
    "Cleaning Type": record.cleaningType,
    Extras: record.extras,
    Frequency: record.frequency,
    "Base Cleaning Price": record.baseCleaningPrice,
    "Bathroom Price": record.bathroomPrice,
    "Cleaning Type Price": record.cleaningTypePrice,
    "Extras Price": record.extrasPrice,
    Subtotal: record.subtotal,
    "Frequency Discount": record.frequencyDiscount,
    "Total Price": record.totalPrice,
    "Estimated Duration Minutes": record.estimatedDurationMinutes,
    "Special Instructions": record.specialInstructions,
    "Policy Accepted": record.policyAccepted,
    "Submission Source": record.submissionSource,
    "Stripe Checkout Session ID": record.stripeCheckoutSessionId,
    "Stripe Payment Intent ID": record.stripePaymentIntentId,
    "Paid At": record.paidAt,
    "Cancelled At": record.cancelledAt,
    "Completed At": record.completedAt,
    "Internal Notes": record.internalNotes,
    "Schema Version": record.schemaVersion,
    "Customer Confirmation Status": record.customerConfirmationStatus,
    "Internal Notification Status": record.internalNotificationStatus,
    "Notification Attempt At": record.notificationAttemptAt,
    "Stripe Customer ID": record.stripeCustomerId,
    "Stripe PaymentMethod ID": record.stripePaymentMethodId,
    "Stripe SetupIntent ID": record.stripeSetupIntentId,
    "Scheduled Charge At": record.scheduledChargeAt,
    "Original Booking Total": record.originalBookingTotal,
    "Charge Amount": record.chargeAmount,
    "Payment Attempt Count": record.paymentAttemptCount,
    "Last Payment Attempt At": record.lastPaymentAttemptAt,
    "Next Payment Attempt At": record.nextPaymentAttemptAt,
    "Payment Failure Code": record.paymentFailureCode,
    "Manual Amount Override": record.manualAmountOverride,
    "Manual Amount Override At": record.manualAmountOverrideAt,
  };

  return BOOKINGS_COLUMNS.map((column) => {
    const value = valueByColumn[column];
    if (value === undefined) {
      throw new Error(`recordToRow: missing value for Bookings column "${column}".`);
    }
    return value;
  });
}

// The Sheets API returns checkbox-formatted cells as an actual JSON
// boolean, not the string "TRUE"/"FALSE", despite this codebase's getRange
// return type being declared string[][] (matching the common case, since
// every other column here is text/number). Handles both forms rather than
// trusting the declared type, since a manually-edited cell could plausibly
// contain either.
function parseSheetBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return String(value ?? "").trim().toUpperCase() === "TRUE";
}

const COLUMN_INDEX = BOOKINGS_COLUMNS.reduce(
  (map, col, i) => {
    map[col] = i;
    return map;
  },
  {} as Record<BookingColumn, number>,
);

/** The inverse of recordToRow — reconstructs a typed BookingRecord from a raw sheet row. */
function rowToRecord(row: string[]): BookingRecord {
  const get = (col: BookingColumn) => row[COLUMN_INDEX[col]] ?? "";
  const getNumber = (col: BookingColumn) => Number(get(col) || 0);
  const getBoolean = (col: BookingColumn) => parseSheetBoolean(row[COLUMN_INDEX[col]]);

  return {
    bookingId: get("Booking ID"),
    submittedAt: get("Submitted At"),
    bookingStatus: get("Booking Status"),
    paymentStatus: get("Payment Status"),
    firstName: get("First Name"),
    lastName: get("Last Name"),
    email: get("Email"),
    mobile: get("Mobile"),
    streetAddress: get("Street Address"),
    apartmentOrUnit: get("Apartment or Unit"),
    city: get("City"),
    state: get("State"),
    zipCode: get("ZIP Code"),
    someoneHome: get("Someone Home"),
    serviceDate: get("Service Date"),
    arrivalWindow: get("Arrival Window"),
    propertyType: get("Property Type"),
    squareFootage: get("Square Footage"),
    bedrooms: get("Bedrooms"),
    bathrooms: get("Bathrooms"),
    cleaningType: get("Cleaning Type"),
    extras: get("Extras"),
    frequency: get("Frequency"),
    baseCleaningPrice: getNumber("Base Cleaning Price"),
    bathroomPrice: getNumber("Bathroom Price"),
    cleaningTypePrice: getNumber("Cleaning Type Price"),
    extrasPrice: getNumber("Extras Price"),
    subtotal: getNumber("Subtotal"),
    frequencyDiscount: getNumber("Frequency Discount"),
    totalPrice: getNumber("Total Price"),
    estimatedDurationMinutes: getNumber("Estimated Duration Minutes"),
    specialInstructions: get("Special Instructions"),
    policyAccepted: getBoolean("Policy Accepted"),
    submissionSource: get("Submission Source"),
    stripeCheckoutSessionId: get("Stripe Checkout Session ID"),
    stripePaymentIntentId: get("Stripe Payment Intent ID"),
    paidAt: get("Paid At"),
    cancelledAt: get("Cancelled At"),
    completedAt: get("Completed At"),
    internalNotes: get("Internal Notes"),
    schemaVersion: getNumber("Schema Version"),
    customerConfirmationStatus: get("Customer Confirmation Status"),
    internalNotificationStatus: get("Internal Notification Status"),
    notificationAttemptAt: get("Notification Attempt At"),
    stripeCustomerId: get("Stripe Customer ID"),
    stripePaymentMethodId: get("Stripe PaymentMethod ID"),
    stripeSetupIntentId: get("Stripe SetupIntent ID"),
    scheduledChargeAt: get("Scheduled Charge At"),
    originalBookingTotal: getNumber("Original Booking Total"),
    chargeAmount: getNumber("Charge Amount"),
    paymentAttemptCount: getNumber("Payment Attempt Count"),
    lastPaymentAttemptAt: get("Last Payment Attempt At"),
    nextPaymentAttemptAt: get("Next Payment Attempt At"),
    paymentFailureCode: get("Payment Failure Code"),
    manualAmountOverride: getBoolean("Manual Amount Override"),
    manualAmountOverrideAt: get("Manual Amount Override At"),
  };
}

export class GoogleSheetsBookingRepository implements BookingRepository {
  async appendBooking(record: BookingRecord): Promise<void> {
    await appendRow(BOOKINGS_FULL_RANGE, recordToRow(record));
  }

  async bookingIdExists(bookingId: string): Promise<boolean> {
    const rows = await getRange(columnRange("Booking ID"));
    return rows.some((row) => row[0] === bookingId);
  }

  async updateNotificationStatus(bookingId: string, update: NotificationStatusUpdate): Promise<void> {
    const idRows = await getRange(columnRange("Booking ID"));
    const rowIndex = idRows.findIndex((row) => row[0] === bookingId);
    if (rowIndex === -1) {
      throw new Error("Booking ID not found when updating notification status.");
    }
    // +2: +1 because idRows is 0-indexed starting at the first data row,
    // +1 more because the sheet's row 1 is the header row.
    const sheetRow = rowIndex + 2;
    const startCol = columnLetter("Customer Confirmation Status");
    const endCol = columnLetter("Notification Attempt At");
    await updateRange(`${BOOKINGS_SHEET_NAME}!${startCol}${sheetRow}:${endCol}${sheetRow}`, [
      update.customerConfirmationStatus,
      update.internalNotificationStatus,
      update.notificationAttemptAt,
    ]);
  }

  async findRecentBookingByIdempotencyToken(token: string): Promise<IdempotentBookingResult | null> {
    const marker = `idempotency_token:${token}`;
    const [notes, ids, totals, durations, dates, windows] = await batchGetRanges([
      columnRange("Internal Notes"),
      columnRange("Booking ID"),
      columnRange("Total Price"),
      columnRange("Estimated Duration Minutes"),
      columnRange("Service Date"),
      columnRange("Arrival Window"),
    ]);

    const rowCount = notes.length;
    const earliestRowToCheck = Math.max(0, rowCount - IDEMPOTENCY_LOOKUP_WINDOW_ROWS);
    // Scan from most-recent backward — a retry is always looking for a
    // very recent match, so this finds it in the fewest comparisons.
    for (let i = rowCount - 1; i >= earliestRowToCheck; i--) {
      const note = notes[i]?.[0] ?? "";
      if (note.includes(marker)) {
        return {
          bookingId: ids[i]?.[0] ?? "",
          totalPrice: Number(totals[i]?.[0] ?? 0),
          estimatedDurationMinutes: Number(durations[i]?.[0] ?? 0),
          serviceDate: dates[i]?.[0] ?? "",
          arrivalWindow: windows[i]?.[0] ?? "",
        };
      }
    }
    return null;
  }

  async getBookingPaymentState(bookingId: string): Promise<BookingPaymentState | null> {
    const [
      ids,
      bookingStatuses,
      paymentStatuses,
      serviceDates,
      stripeCustomerIds,
      stripePaymentMethodIds,
      scheduledChargeAts,
      originalTotals,
      chargeAmounts,
      attemptCounts,
      nextAttemptAts,
      manualOverrides,
    ] = await batchGetRanges([
      columnRange("Booking ID"),
      columnRange("Booking Status"),
      columnRange("Payment Status"),
      columnRange("Service Date"),
      columnRange("Stripe Customer ID"),
      columnRange("Stripe PaymentMethod ID"),
      columnRange("Scheduled Charge At"),
      columnRange("Original Booking Total"),
      columnRange("Charge Amount"),
      columnRange("Payment Attempt Count"),
      columnRange("Next Payment Attempt At"),
      columnRange("Manual Amount Override"),
    ]);

    const rowIndex = ids.findIndex((row) => row[0] === bookingId);
    if (rowIndex === -1) return null;

    return {
      bookingId,
      bookingStatus: bookingStatuses[rowIndex]?.[0] ?? "",
      paymentStatus: paymentStatuses[rowIndex]?.[0] ?? "",
      serviceDate: serviceDates[rowIndex]?.[0] ?? "",
      stripeCustomerId: stripeCustomerIds[rowIndex]?.[0] ?? "",
      stripePaymentMethodId: stripePaymentMethodIds[rowIndex]?.[0] ?? "",
      scheduledChargeAt: scheduledChargeAts[rowIndex]?.[0] ?? "",
      originalBookingTotal: Number(originalTotals[rowIndex]?.[0] ?? 0),
      chargeAmount: Number(chargeAmounts[rowIndex]?.[0] ?? 0),
      paymentAttemptCount: Number(attemptCounts[rowIndex]?.[0] ?? 0),
      nextPaymentAttemptAt: nextAttemptAts[rowIndex]?.[0] ?? "",
      manualAmountOverride: parseSheetBoolean(manualOverrides[rowIndex]?.[0]),
    };
  }

  async updatePaymentAttempt(bookingId: string, update: PaymentAttemptUpdate): Promise<void> {
    const idRows = await getRange(columnRange("Booking ID"));
    const rowIndex = idRows.findIndex((row) => row[0] === bookingId);
    if (rowIndex === -1) {
      throw new Error("Booking ID not found when updating payment attempt.");
    }
    const sheetRow = rowIndex + 2;

    const paymentStatusCol = columnLetter("Payment Status");
    const intentStartCol = columnLetter("Stripe Payment Intent ID");
    const intentEndCol = columnLetter("Paid At");
    const attemptStartCol = columnLetter("Payment Attempt Count");
    const attemptEndCol = columnLetter("Payment Failure Code");

    await batchUpdateRanges([
      { range: `${BOOKINGS_SHEET_NAME}!${paymentStatusCol}${sheetRow}`, row: [update.paymentStatus] },
      {
        range: `${BOOKINGS_SHEET_NAME}!${intentStartCol}${sheetRow}:${intentEndCol}${sheetRow}`,
        row: [update.stripePaymentIntentId, update.paidAt],
      },
      {
        range: `${BOOKINGS_SHEET_NAME}!${attemptStartCol}${sheetRow}:${attemptEndCol}${sheetRow}`,
        row: [update.paymentAttemptCount, update.lastPaymentAttemptAt, update.nextPaymentAttemptAt, update.paymentFailureCode],
      },
    ]);
  }

  async getFullBookingRecord(bookingId: string): Promise<BookingRecord | null> {
    const idRows = await getRange(columnRange("Booking ID"));
    const rowIndex = idRows.findIndex((row) => row[0] === bookingId);
    if (rowIndex === -1) return null;
    const sheetRow = rowIndex + 2;
    const rows = await getRange(`${BOOKINGS_SHEET_NAME}!A${sheetRow}:${BOOKINGS_LAST_COLUMN_LETTER}${sheetRow}`);
    const row = rows[0];
    if (!row) return null;
    return rowToRecord(row);
  }
}

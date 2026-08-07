// SERVER-ONLY. The Google Sheets implementation of BookingRepository.
import "server-only";
import { appendRow, batchGetRanges, getRange } from "./sheetsClient";
import { BOOKINGS_COLUMNS, BOOKINGS_FULL_RANGE, BOOKINGS_SHEET_NAME, columnLetter } from "./bookingsSheetSchema";
import type { BookingRepository, IdempotentBookingResult } from "./repository";
import type { BookingRecord } from "./types";

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
  };

  return BOOKINGS_COLUMNS.map((column) => {
    const value = valueByColumn[column];
    if (value === undefined) {
      throw new Error(`recordToRow: missing value for Bookings column "${column}".`);
    }
    return value;
  });
}

export class GoogleSheetsBookingRepository implements BookingRepository {
  async appendBooking(record: BookingRecord): Promise<void> {
    await appendRow(BOOKINGS_FULL_RANGE, recordToRow(record));
  }

  async bookingIdExists(bookingId: string): Promise<boolean> {
    const rows = await getRange(columnRange("Booking ID"));
    return rows.some((row) => row[0] === bookingId);
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
}

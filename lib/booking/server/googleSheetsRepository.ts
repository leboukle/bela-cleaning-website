// SERVER-ONLY. The Google Sheets implementation of BookingRepository.
import "server-only";
import { appendRow, batchGetRanges, batchUpdateRanges, getRange, updateRange } from "./sheetsClient";
import {
  BOOKING_STATUS,
  BOOKINGS_COLUMNS,
  BOOKINGS_FULL_RANGE,
  BOOKINGS_LAST_COLUMN_LETTER,
  BOOKINGS_SHEET_NAME,
  columnLetter,
  type BookingColumn,
} from "./bookingsSheetSchema";
import type { BookingRepository, IdempotentBookingResult } from "./repository";
import type {
  AppointmentReminderUpdate,
  AssignableBookingSummary,
  BookingCancellationInitiateUpdate,
  BookingPaymentState,
  BookingRecord,
  BookingReminderState,
  BookingRescheduleUpdate,
  CancellationFeeOutcomeUpdate,
  PaymentAttemptUpdate,
} from "./types";
import type { NotificationStatusUpdate } from "./notificationStatus";
import { manageTokenHashesMatch } from "./manageToken";

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
    "Manage Booking Token Hash": record.manageBookingTokenHash,
    "Cancellation Fee Amount": record.cancellationFeeAmount,
    "Rescheduled At": record.rescheduledAt,
    "Original Service Date": record.originalServiceDate,
    "Original Arrival Window": record.originalArrivalWindow,
    "Appointment Reminder Status": record.appointmentReminderStatus,
    "Appointment Reminder Sent At": record.appointmentReminderSentAt,
    "Service Start Time": record.serviceStartTime,
    "Original Service Start Time": record.originalServiceStartTime,
    "Appointment Reminder Attempts": record.appointmentReminderAttempts,
    "Manage Booking Reminder Token Hash": record.manageBookingReminderTokenHash,
    "Square Footage Price": record.squareFootagePrice,
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
    manageBookingTokenHash: get("Manage Booking Token Hash"),
    cancellationFeeAmount: getNumber("Cancellation Fee Amount"),
    rescheduledAt: get("Rescheduled At"),
    originalServiceDate: get("Original Service Date"),
    originalArrivalWindow: get("Original Arrival Window"),
    appointmentReminderStatus: get("Appointment Reminder Status"),
    appointmentReminderSentAt: get("Appointment Reminder Sent At"),
    serviceStartTime: get("Service Start Time"),
    originalServiceStartTime: get("Original Service Start Time"),
    appointmentReminderAttempts: getNumber("Appointment Reminder Attempts"),
    manageBookingReminderTokenHash: get("Manage Booking Reminder Token Hash"),
    squareFootagePrice: getNumber("Square Footage Price"),
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
    const [notes, ids, totals, durations, dates, windows, startTimes] = await batchGetRanges([
      columnRange("Internal Notes"),
      columnRange("Booking ID"),
      columnRange("Total Price"),
      columnRange("Estimated Duration Minutes"),
      columnRange("Service Date"),
      columnRange("Arrival Window"),
      columnRange("Service Start Time"),
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
          serviceStartTime: startTimes[i]?.[0] ?? "",
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
      stripePaymentIntentIds,
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
      columnRange("Stripe Payment Intent ID"),
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
      stripePaymentIntentId: stripePaymentIntentIds[rowIndex]?.[0] ?? "",
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

  /**
   * Checks BOTH the original "Manage Booking Token Hash" and the
   * reminder-issued "Manage Booking Reminder Token Hash" columns — either
   * one resolving to a row is a valid match for that row's booking.
   * Post-verification fix (see docs/manage-booking.md): the reminder
   * email needs its own directly-usable link, and since the original
   * token's raw value is never recoverable from its hash, a second,
   * independent token is minted at reminder time instead of rotating the
   * original — so both links must keep working, indefinitely, for the
   * same booking.
   */
  async findBookingIdByManageTokenHash(tokenHash: string): Promise<string | null> {
    const [originalHashes, reminderHashes, ids] = await batchGetRanges([
      columnRange("Manage Booking Token Hash"),
      columnRange("Manage Booking Reminder Token Hash"),
      columnRange("Booking ID"),
    ]);
    const rowIndex = originalHashes.findIndex(
      (row, i) => manageTokenHashesMatch(row[0] ?? "", tokenHash) || manageTokenHashesMatch(reminderHashes[i]?.[0] ?? "", tokenHash),
    );
    if (rowIndex === -1) return null;
    return ids[rowIndex]?.[0] ?? null;
  }

  async markBookingCancelled(bookingId: string, update: BookingCancellationInitiateUpdate): Promise<void> {
    const idRows = await getRange(columnRange("Booking ID"));
    const rowIndex = idRows.findIndex((row) => row[0] === bookingId);
    if (rowIndex === -1) {
      throw new Error("Booking ID not found when marking booking cancelled.");
    }
    const sheetRow = rowIndex + 2;

    const statusStartCol = columnLetter("Booking Status");
    const statusEndCol = columnLetter("Payment Status");
    const cancelledAtCol = columnLetter("Cancelled At");
    const feeAmountCol = columnLetter("Cancellation Fee Amount");

    await batchUpdateRanges([
      {
        range: `${BOOKINGS_SHEET_NAME}!${statusStartCol}${sheetRow}:${statusEndCol}${sheetRow}`,
        row: [BOOKING_STATUS.CANCELLED, update.paymentStatus],
      },
      { range: `${BOOKINGS_SHEET_NAME}!${cancelledAtCol}${sheetRow}`, row: [update.cancelledAt] },
      { range: `${BOOKINGS_SHEET_NAME}!${feeAmountCol}${sheetRow}`, row: [update.cancellationFeeAmount] },
    ]);
  }

  async updateCancellationFeeOutcome(bookingId: string, update: CancellationFeeOutcomeUpdate): Promise<void> {
    const idRows = await getRange(columnRange("Booking ID"));
    const rowIndex = idRows.findIndex((row) => row[0] === bookingId);
    if (rowIndex === -1) {
      throw new Error("Booking ID not found when updating cancellation fee outcome.");
    }
    const sheetRow = rowIndex + 2;

    const paymentStatusCol = columnLetter("Payment Status");
    const intentStartCol = columnLetter("Stripe Payment Intent ID");
    const intentEndCol = columnLetter("Paid At");

    await batchUpdateRanges([
      { range: `${BOOKINGS_SHEET_NAME}!${paymentStatusCol}${sheetRow}`, row: [update.paymentStatus] },
      {
        range: `${BOOKINGS_SHEET_NAME}!${intentStartCol}${sheetRow}:${intentEndCol}${sheetRow}`,
        row: [update.stripePaymentIntentId, update.paidAt],
      },
    ]);
  }

  async updateBookingReschedule(bookingId: string, update: BookingRescheduleUpdate): Promise<void> {
    const idRows = await getRange(columnRange("Booking ID"));
    const rowIndex = idRows.findIndex((row) => row[0] === bookingId);
    if (rowIndex === -1) {
      throw new Error("Booking ID not found when updating booking reschedule.");
    }
    const sheetRow = rowIndex + 2;

    const dateStartCol = columnLetter("Service Date");
    const dateEndCol = columnLetter("Arrival Window");
    const chargeAtCol = columnLetter("Scheduled Charge At");
    const rescheduledAtCol = columnLetter("Rescheduled At");
    const originalStartCol = columnLetter("Original Service Date");
    const originalEndCol = columnLetter("Original Arrival Window");
    const startTimeCol = columnLetter("Service Start Time");
    const originalStartTimeCol = columnLetter("Original Service Start Time");

    await batchUpdateRanges([
      {
        range: `${BOOKINGS_SHEET_NAME}!${dateStartCol}${sheetRow}:${dateEndCol}${sheetRow}`,
        row: [update.serviceDate, update.arrivalWindow],
      },
      { range: `${BOOKINGS_SHEET_NAME}!${chargeAtCol}${sheetRow}`, row: [update.scheduledChargeAt] },
      { range: `${BOOKINGS_SHEET_NAME}!${rescheduledAtCol}${sheetRow}`, row: [update.rescheduledAt] },
      {
        range: `${BOOKINGS_SHEET_NAME}!${originalStartCol}${sheetRow}:${originalEndCol}${sheetRow}`,
        row: [update.originalServiceDate, update.originalArrivalWindow],
      },
      { range: `${BOOKINGS_SHEET_NAME}!${startTimeCol}${sheetRow}`, row: [update.serviceStartTime] },
      { range: `${BOOKINGS_SHEET_NAME}!${originalStartTimeCol}${sheetRow}`, row: [update.originalServiceStartTime] },
    ]);
  }

  async getBookingReminderState(bookingId: string): Promise<BookingReminderState | null> {
    const [ids, bookingStatuses, reminderStatuses, reminderAttempts, scheduledChargeAts, durations] = await batchGetRanges([
      columnRange("Booking ID"),
      columnRange("Booking Status"),
      columnRange("Appointment Reminder Status"),
      columnRange("Appointment Reminder Attempts"),
      columnRange("Scheduled Charge At"),
      columnRange("Estimated Duration Minutes"),
    ]);

    const rowIndex = ids.findIndex((row) => row[0] === bookingId);
    if (rowIndex === -1) return null;

    return {
      bookingId,
      bookingStatus: bookingStatuses[rowIndex]?.[0] ?? "",
      appointmentReminderStatus: reminderStatuses[rowIndex]?.[0] ?? "",
      appointmentReminderAttempts: Number(reminderAttempts[rowIndex]?.[0] ?? 0),
      scheduledChargeAt: scheduledChargeAts[rowIndex]?.[0] ?? "",
      estimatedDurationMinutes: Number(durations[rowIndex]?.[0] ?? 0),
    };
  }

  async updateAppointmentReminderStatus(bookingId: string, update: AppointmentReminderUpdate): Promise<void> {
    const idRows = await getRange(columnRange("Booking ID"));
    const rowIndex = idRows.findIndex((row) => row[0] === bookingId);
    if (rowIndex === -1) {
      throw new Error("Booking ID not found when updating appointment reminder status.");
    }
    const sheetRow = rowIndex + 2;

    const statusStartCol = columnLetter("Appointment Reminder Status");
    const statusEndCol = columnLetter("Appointment Reminder Sent At");
    const attemptsStartCol = columnLetter("Appointment Reminder Attempts");
    const attemptsEndCol = columnLetter("Manage Booking Reminder Token Hash");

    await batchUpdateRanges([
      {
        range: `${BOOKINGS_SHEET_NAME}!${statusStartCol}${sheetRow}:${statusEndCol}${sheetRow}`,
        row: [update.appointmentReminderStatus, update.appointmentReminderSentAt],
      },
      {
        range: `${BOOKINGS_SHEET_NAME}!${attemptsStartCol}${sheetRow}:${attemptsEndCol}${sheetRow}`,
        row: [update.appointmentReminderAttempts, update.manageBookingReminderTokenHash],
      },
    ]);
  }

  async listAssignableBookings(todayDateKey: string): Promise<AssignableBookingSummary[]> {
    const [
      ids,
      bookingStatuses,
      firstNames,
      streetAddresses,
      apartmentOrUnits,
      cities,
      states,
      zipCodes,
      serviceDates,
      arrivalWindows,
      serviceStartTimes,
      cleaningTypes,
      chargeAmounts,
    ] = await batchGetRanges([
      columnRange("Booking ID"),
      columnRange("Booking Status"),
      columnRange("First Name"),
      columnRange("Street Address"),
      columnRange("Apartment or Unit"),
      columnRange("City"),
      columnRange("State"),
      columnRange("ZIP Code"),
      columnRange("Service Date"),
      columnRange("Arrival Window"),
      columnRange("Service Start Time"),
      columnRange("Cleaning Type"),
      columnRange("Charge Amount"),
    ]);

    const summaries: AssignableBookingSummary[] = [];
    for (let i = 0; i < ids.length; i++) {
      const bookingId = ids[i]?.[0];
      if (!bookingId) continue;
      const bookingStatus = bookingStatuses[i]?.[0] ?? "";
      if (bookingStatus === BOOKING_STATUS.CANCELLED) continue;
      const serviceDate = serviceDates[i]?.[0] ?? "";
      if (serviceDate < todayDateKey) continue;

      summaries.push({
        bookingId,
        bookingStatus,
        firstName: firstNames[i]?.[0] ?? "",
        streetAddress: streetAddresses[i]?.[0] ?? "",
        apartmentOrUnit: apartmentOrUnits[i]?.[0] ?? "",
        city: cities[i]?.[0] ?? "",
        state: states[i]?.[0] ?? "",
        zipCode: zipCodes[i]?.[0] ?? "",
        serviceDate,
        arrivalWindow: arrivalWindows[i]?.[0] ?? "",
        serviceStartTime: serviceStartTimes[i]?.[0] ?? "",
        cleaningType: cleaningTypes[i]?.[0] ?? "",
        chargeAmount: Number(chargeAmounts[i]?.[0] ?? 0),
      });
    }
    return summaries.sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
  }

  async markBookingCompleted(bookingId: string, completedAt: string): Promise<void> {
    const idRows = await getRange(columnRange("Booking ID"));
    const rowIndex = idRows.findIndex((row) => row[0] === bookingId);
    if (rowIndex === -1) {
      throw new Error("Booking ID not found when marking booking completed.");
    }
    const sheetRow = rowIndex + 2;
    const col = columnLetter("Completed At");
    await updateRange(`${BOOKINGS_SHEET_NAME}!${col}${sheetRow}`, [completedAt]);
  }
}

// SERVER-ONLY. The orchestrator (STEPs 5-15 tied together): validate ->
// check availability -> price/duration -> generate a booking ID -> dedupe
// via idempotency -> re-check availability immediately before writing ->
// append. Nothing above this module (the API route) talks to Settings,
// availability, pricing, or the repository directly — this is the single
// place that sequences them, so the sequencing itself can be read, tested,
// and reasoned about in one place.
import "server-only";
import { validateSubmission } from "./validateSubmission";
import { getBookingSettings } from "./settings";
import { checkDateAvailability } from "./availability";
import { calculateAuthoritativePricing, PricingError } from "./pricing";
import { generateBookingId } from "./bookingId";
import { serializeExtras } from "./extras";
import { sanitizeForSheets } from "./sanitize";
import { withIdempotencyFastPath } from "./idempotency";
import type { NotificationService, NotificationResult } from "./notificationService";
import { NOTIFICATION_STATUS } from "./notificationStatus";
import { BOOKING_STATUS, PAYMENT_STATUS, SUBMISSION_SOURCE } from "./bookingsSheetSchema";
import {
  PROPERTY_TYPE_OPTIONS,
  SQUARE_FOOTAGE_OPTIONS,
  getBathroomOption,
  getBedroomOption,
  getCleaningTypeOption,
  getFrequencyOption,
} from "@/lib/booking/config";
import { getArrivalWindowOption } from "@/lib/booking/schedule";
import type { BookingRepository } from "./repository";
import type { BookingRecord, BookingSubmissionInput, ValidatedBooking, ValidationIssue } from "./types";

// The subset of NotificationService this orchestrator actually calls.
// Narrowed the same way calculate.ts's PricingInput narrows BookingState —
// lets tests pass a plain object double instead of a real NotificationService
// instance (which carries a private field, making it otherwise impossible
// to satisfy structurally).
export type NotificationSender = Pick<
  NotificationService,
  "sendCustomerBookingReceived" | "sendInternalNewBookingNotification"
>;

export type BookingSubmissionSuccess = {
  ok: true;
  bookingId: string;
  serviceDate: string;
  arrivalWindow: string;
  totalPrice: number;
  estimatedDurationMinutes: number;
};

export type BookingSubmissionFailure =
  | { ok: false; code: "validation"; issues: ValidationIssue[] }
  | { ok: false; code: "date-unavailable"; message: string }
  | { ok: false; code: "server-error"; message: string };

export type BookingSubmissionResult = BookingSubmissionSuccess | BookingSubmissionFailure;

const GENERIC_SERVER_ERROR_MESSAGE = "We're temporarily unable to process bookings. Please try again shortly.";
const MAX_BOOKING_ID_ATTEMPTS = 5;

function logServerError(step: string, error: unknown): void {
  console.error(`[bookingService] ${step} failed:`, error instanceof Error ? error.message : "unknown error");
}

// Sends both notification emails for a freshly-persisted booking. Never
// throws — a notification failure must never affect the booking result
// that's already been written and is about to be returned as a success
// (STEP 9 of the milestone spec). Logs only a bookingId + ok/failed
// status, never the recipient address, subject, or body — see
// docs/notifications.md's privacy section.
function describeNotificationOutcome(result: PromiseSettledResult<NotificationResult>): { ok: boolean; reason: string } {
  if (result.status === "rejected") {
    return { ok: false, reason: result.reason instanceof Error ? result.reason.message : "unknown error" };
  }
  if (result.value.ok) {
    return { ok: true, reason: "" };
  }
  return { ok: false, reason: result.value.error };
}

async function sendBookingNotifications(
  notificationService: NotificationSender,
  repository: BookingRepository,
  record: BookingRecord,
): Promise<void> {
  const [customerResult, internalResult] = await Promise.allSettled([
    notificationService.sendCustomerBookingReceived(record),
    notificationService.sendInternalNewBookingNotification(record),
  ]);

  const customerOutcome = describeNotificationOutcome(customerResult);
  if (customerOutcome.ok) {
    console.log(`[bookingService] customer confirmation email sent: bookingId=${record.bookingId}`);
  } else {
    console.error(
      `[bookingService] customer confirmation email failed: bookingId=${record.bookingId} reason=${customerOutcome.reason}`,
    );
  }

  const internalOutcome = describeNotificationOutcome(internalResult);
  if (internalOutcome.ok) {
    console.log(`[bookingService] internal notification email sent: bookingId=${record.bookingId}`);
  } else {
    console.error(
      `[bookingService] internal notification email failed: bookingId=${record.bookingId} reason=${internalOutcome.reason}`,
    );
  }

  // Records the outcome for operational visibility (Milestone 4,
  // docs/notifications.md §7). Best-effort like everything else past the
  // append: a failure here is logged and swallowed, never surfaced to the
  // customer and never allowed to make a stored booking look unsuccessful.
  try {
    await repository.updateNotificationStatus(record.bookingId, {
      customerConfirmationStatus: customerOutcome.ok ? NOTIFICATION_STATUS.SENT : NOTIFICATION_STATUS.FAILED,
      internalNotificationStatus: internalOutcome.ok ? NOTIFICATION_STATUS.SENT : NOTIFICATION_STATUS.FAILED,
      notificationAttemptAt: new Date().toISOString(),
    });
  } catch (error) {
    logServerError("updateNotificationStatus", error);
  }
}

function buildBookingRecord(
  booking: ValidatedBooking,
  bookingId: string,
  pricing: ReturnType<typeof calculateAuthoritativePricing>,
  schemaVersion: number,
  now: Date,
): BookingRecord {
  const propertyTypeLabel = PROPERTY_TYPE_OPTIONS.find((o) => o.id === booking.propertyType)?.label ?? booking.propertyType;
  const squareFootageLabel = SQUARE_FOOTAGE_OPTIONS.find((o) => o.id === booking.squareFootage)?.label ?? booking.squareFootage;
  const arrivalWindowOption = getArrivalWindowOption(booking.arrivalWindow);

  return {
    bookingId,
    submittedAt: now.toISOString(),
    bookingStatus: BOOKING_STATUS.PENDING_PAYMENT,
    paymentStatus: PAYMENT_STATUS.UNPAID,
    firstName: sanitizeForSheets(booking.firstName),
    lastName: sanitizeForSheets(booking.lastName),
    email: sanitizeForSheets(booking.email),
    mobile: sanitizeForSheets(booking.phone),
    streetAddress: sanitizeForSheets(booking.addressStreet),
    apartmentOrUnit: sanitizeForSheets(booking.addressUnit),
    city: sanitizeForSheets(booking.addressCity),
    state: sanitizeForSheets(booking.addressState),
    zipCode: booking.addressZip,
    someoneHome: booking.someoneHome === "home" ? "Yes, someone will be home" : "No, no one will be home",
    serviceDate: booking.serviceDate,
    arrivalWindow: arrivalWindowOption.label,
    propertyType: sanitizeForSheets(
      booking.propertyType === "other" && booking.propertyTypeOther
        ? `Other — ${booking.propertyTypeOther}`
        : propertyTypeLabel,
    ),
    squareFootage: squareFootageLabel,
    bedrooms: getBedroomOption(booking.bedrooms).label,
    bathrooms: getBathroomOption(booking.bathrooms).label,
    cleaningType: getCleaningTypeOption(booking.cleaningType).label,
    extras: serializeExtras(booking.extras),
    frequency: getFrequencyOption(booking.frequency).label,
    baseCleaningPrice: pricing.baseCleaningPrice,
    bathroomPrice: pricing.bathroomPrice,
    cleaningTypePrice: pricing.cleaningTypePrice,
    extrasPrice: pricing.extrasPrice,
    subtotal: pricing.subtotal,
    frequencyDiscount: pricing.frequencyDiscount,
    totalPrice: pricing.totalPrice,
    estimatedDurationMinutes: pricing.estimatedDurationMinutes,
    specialInstructions: sanitizeForSheets(booking.specialInstructions),
    policyAccepted: true,
    submissionSource: SUBMISSION_SOURCE,
    stripeCheckoutSessionId: "",
    stripePaymentIntentId: "",
    paidAt: "",
    cancelledAt: "",
    completedAt: "",
    internalNotes: `idempotency_token:${booking.idempotencyToken}`,
    schemaVersion,
    customerConfirmationStatus: "",
    internalNotificationStatus: "",
    notificationAttemptAt: "",
  };
}

/**
 * Submits a single booking. Every outcome is a typed result — callers
 * (the API route) never need to inspect thrown errors to decide what to
 * tell the customer.
 */
export async function submitBooking(
  input: BookingSubmissionInput,
  repository: BookingRepository,
  notificationService: NotificationSender,
): Promise<BookingSubmissionResult> {
  let settings;
  try {
    settings = await getBookingSettings();
  } catch (error) {
    logServerError("getBookingSettings", error);
    return { ok: false, code: "server-error", message: GENERIC_SERVER_ERROR_MESSAGE };
  }

  const validation = validateSubmission(input, { settings });
  if (!validation.ok) {
    return { ok: false, code: "validation", issues: validation.issues };
  }
  const booking = validation.booking;

  return withIdempotencyFastPath<BookingSubmissionResult>(booking.idempotencyToken, async () => {
    let existing;
    try {
      existing = await repository.findRecentBookingByIdempotencyToken(booking.idempotencyToken);
    } catch (error) {
      logServerError("findRecentBookingByIdempotencyToken", error);
      return { ok: false, code: "server-error", message: GENERIC_SERVER_ERROR_MESSAGE };
    }
    if (existing) {
      return {
        ok: true,
        bookingId: existing.bookingId,
        serviceDate: existing.serviceDate,
        arrivalWindow: existing.arrivalWindow,
        totalPrice: existing.totalPrice,
        estimatedDurationMinutes: existing.estimatedDurationMinutes,
      };
    }

    let availability;
    try {
      availability = await checkDateAvailability(booking.serviceDate);
    } catch (error) {
      logServerError("checkDateAvailability", error);
      return { ok: false, code: "server-error", message: GENERIC_SERVER_ERROR_MESSAGE };
    }
    if (!availability.available) {
      return {
        ok: false,
        code: "date-unavailable",
        message: "That date is no longer available. Please choose another appointment date.",
      };
    }

    let pricing;
    try {
      pricing = calculateAuthoritativePricing(booking);
    } catch (error) {
      logServerError("calculateAuthoritativePricing", error);
      const message = error instanceof PricingError ? error.message : GENERIC_SERVER_ERROR_MESSAGE;
      return { ok: false, code: "server-error", message };
    }

    let bookingId = generateBookingId();
    try {
      let attempts = 0;
      while (await repository.bookingIdExists(bookingId)) {
        attempts += 1;
        if (attempts >= MAX_BOOKING_ID_ATTEMPTS) {
          throw new Error("Exhausted booking ID generation attempts.");
        }
        bookingId = generateBookingId();
      }
    } catch (error) {
      logServerError("bookingIdExists", error);
      return { ok: false, code: "server-error", message: GENERIC_SERVER_ERROR_MESSAGE };
    }

    // Immediate re-check right before the append: the first check above
    // could be seconds stale by the time pricing/ID generation finish, and
    // this is the last chance to catch a concurrent booking that filled
    // the last slot in between (STEP 7's authoritative-at-write-time
    // requirement). A residual, narrow race still exists between this
    // check and the append itself — see docs/booking-backend.md.
    let recheck;
    try {
      recheck = await checkDateAvailability(booking.serviceDate);
    } catch (error) {
      logServerError("checkDateAvailability (recheck)", error);
      return { ok: false, code: "server-error", message: GENERIC_SERVER_ERROR_MESSAGE };
    }
    if (!recheck.available) {
      return {
        ok: false,
        code: "date-unavailable",
        message: "That date just became unavailable. Please choose another appointment date.",
      };
    }

    const record = buildBookingRecord(booking, bookingId, pricing, settings.schemaVersion, new Date());
    try {
      await repository.appendBooking(record);
    } catch (error) {
      logServerError("appendBooking", error);
      return { ok: false, code: "server-error", message: GENERIC_SERVER_ERROR_MESSAGE };
    }

    // The booking is now durably persisted — everything past this point is
    // best-effort. A notification failure is logged but never changes the
    // success result below (STEP 9): the booking must never appear to
    // "disappear" just because an email didn't go out.
    await sendBookingNotifications(notificationService, repository, record);

    return {
      ok: true,
      bookingId,
      serviceDate: booking.serviceDate,
      arrivalWindow: getArrivalWindowOption(booking.arrivalWindow).label,
      totalPrice: pricing.totalPrice,
      estimatedDurationMinutes: pricing.estimatedDurationMinutes,
    };
  });
}

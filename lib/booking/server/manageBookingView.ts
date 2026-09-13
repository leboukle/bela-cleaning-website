// SERVER-ONLY. Builds the customer-safe view of a booking for the Manage
// Booking page — an explicit field whitelist. Never exposes Stripe
// Customer/PaymentMethod/SetupIntent/PaymentIntent IDs, internal
// notification status, internal notes, or any other operational-only
// field; see docs/manage-booking.md for the full "never expose" list.
import "server-only";
import { BOOKING_STATUS, PAYMENT_STATUS } from "./bookingsSheetSchema";
import { getBookingTimingStatus, calculateLateCancellationFeeCents } from "./cancellationPolicy";
import { getBookingSettings } from "./settings";
import { describeExtras } from "./extrasDescription";
import { getScheduleDisplayLabel } from "@/lib/booking/schedule";
import type { BookingRecord } from "./types";

export type ManageBookingView = {
  bookingId: string;
  displayStatus: string;
  serviceDate: string;
  // Milestone 6 amendment: the resolved, human-readable appointment time
  // — the exact start time for a new-model booking, or the legacy
  // arrival-window label + range for a pre-amendment one. See
  // lib/booking/schedule.ts's getScheduleDisplayLabel.
  scheduleDisplayLabel: string;
  streetAddress: string;
  apartmentOrUnit: string;
  city: string;
  state: string;
  zipCode: string;
  cleaningType: string;
  estimatedDurationMinutes: number;
  totalPrice: number;
  extras: string[];
  frequency: string;
  eligibility: {
    canCancel: boolean;
    canReschedule: boolean;
    isLateWindow: boolean;
    lateCancellationFeeCents: number | null;
  };
};

function describeDisplayStatus(record: BookingRecord): string {
  if (record.bookingStatus === BOOKING_STATUS.CANCELLED) {
    switch (record.paymentStatus) {
      case PAYMENT_STATUS.CANCELLATION_FEE_PAID:
        return "Cancelled (late-cancellation fee charged)";
      case PAYMENT_STATUS.CANCELLATION_FEE_FAILED:
        return "Cancelled (late-cancellation fee could not be processed)";
      case PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING:
        return "Cancelled (processing late-cancellation fee)";
      default:
        return "Cancelled";
    }
  }
  if (record.paymentStatus === PAYMENT_STATUS.PAID) return "Completed";
  return "Confirmed";
}

export async function buildManageBookingView(record: BookingRecord, now: Date = new Date()): Promise<ManageBookingView> {
  const isPreCharge = record.bookingStatus !== BOOKING_STATUS.CANCELLED && record.paymentStatus === PAYMENT_STATUS.SCHEDULED;

  let isMoreThan24HoursOut = false;
  if (isPreCharge) {
    const settings = await getBookingSettings();
    const timing = getBookingTimingStatus(record.serviceDate, record.serviceStartTime, record.arrivalWindow, settings.timezone, now);
    isMoreThan24HoursOut = timing.isMoreThan24HoursOut;
  }

  const canCancel = isPreCharge;
  const canReschedule = isPreCharge && isMoreThan24HoursOut;
  const isLateWindow = isPreCharge && !isMoreThan24HoursOut;

  return {
    bookingId: record.bookingId,
    displayStatus: describeDisplayStatus(record),
    serviceDate: record.serviceDate,
    scheduleDisplayLabel: getScheduleDisplayLabel(record),
    streetAddress: record.streetAddress,
    apartmentOrUnit: record.apartmentOrUnit,
    city: record.city,
    state: record.state,
    zipCode: record.zipCode,
    cleaningType: record.cleaningType,
    estimatedDurationMinutes: record.estimatedDurationMinutes,
    totalPrice: record.chargeAmount,
    extras: describeExtras(record.extras),
    frequency: record.frequency,
    eligibility: {
      canCancel,
      canReschedule,
      isLateWindow,
      lateCancellationFeeCents: canCancel && isLateWindow ? calculateLateCancellationFeeCents(record.chargeAmount) : null,
    },
  };
}

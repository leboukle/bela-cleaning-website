// SERVER-ONLY. Types for the booking submission pipeline: the raw,
// untrusted JSON body (BookingSubmissionInput), the fully-validated result
// (ValidatedBooking), and the final persisted shape (BookingRecord).
import "server-only";
import type {
  AccessId,
  ArrivalWindowId,
  BathroomId,
  BedroomId,
  CleaningTypeId,
  ExtrasState,
  FrequencyId,
  PropertyTypeId,
  SquareFootageId,
} from "@/lib/booking/types";

/**
 * The raw shape sent by the client. Every field is `unknown`-adjacent on
 * purpose — nothing here is trusted until validateSubmission.ts has run.
 * Kept intentionally close to BookingState's field names for readability,
 * but this is a wire type, not BookingState itself: the client's
 * prototype-only UI fields (stepIndex, customEstimateTrigger, etc.) are
 * never sent.
 */
export type BookingSubmissionInput = {
  idempotencyToken?: unknown;
  honeypot?: unknown;

  propertyType?: unknown;
  propertyTypeOther?: unknown;
  squareFootage?: unknown;
  bedrooms?: unknown;
  bathrooms?: unknown;
  cleaningType?: unknown;
  extras?: unknown;
  frequency?: unknown;

  zipCode?: unknown;
  serviceDate?: unknown;
  arrivalWindow?: unknown;

  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;

  addressStreet?: unknown;
  addressUnit?: unknown;
  addressCity?: unknown;
  addressState?: unknown;
  addressZip?: unknown;

  someoneHome?: unknown;
  specialInstructions?: unknown;

  agreedToPolicy?: unknown;

  // Client-displayed values, used only for tamper detection — never
  // trusted as the authoritative figures. See validateSubmission.ts.
  clientTotalPrice?: unknown;
  clientDurationMinutes?: unknown;
};

export type ValidatedBooking = {
  propertyType: PropertyTypeId;
  propertyTypeOther: string;
  squareFootage: SquareFootageId;
  bedrooms: BedroomId;
  bathrooms: BathroomId;
  cleaningType: CleaningTypeId;
  extras: ExtrasState;
  frequency: FrequencyId;

  zipCode: string;
  city: string;
  serviceDate: string; // yyyy-mm-dd
  arrivalWindow: ArrivalWindowId;

  firstName: string;
  lastName: string;
  email: string;
  phone: string;

  addressStreet: string;
  addressUnit: string;
  addressCity: string;
  addressState: string;
  addressZip: string;

  someoneHome: AccessId;
  specialInstructions: string;

  agreedToPolicy: true;
  idempotencyToken: string;
};

export type ValidationIssue = {
  field: string;
  message: string;
};

export type ValidationResult =
  | { ok: true; booking: ValidatedBooking }
  | { ok: false; issues: ValidationIssue[] };

/** The exact record appended to the Bookings sheet, in column order. */
export type BookingRecord = {
  bookingId: string;
  submittedAt: string;
  bookingStatus: string;
  paymentStatus: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  streetAddress: string;
  apartmentOrUnit: string;
  city: string;
  state: string;
  zipCode: string;
  someoneHome: string;
  serviceDate: string;
  arrivalWindow: string;
  propertyType: string;
  squareFootage: string;
  bedrooms: string;
  bathrooms: string;
  cleaningType: string;
  extras: string;
  frequency: string;
  baseCleaningPrice: number;
  bathroomPrice: number;
  cleaningTypePrice: number;
  extrasPrice: number;
  subtotal: number;
  frequencyDiscount: number;
  totalPrice: number;
  estimatedDurationMinutes: number;
  specialInstructions: string;
  policyAccepted: boolean;
  submissionSource: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string;
  paidAt: string;
  cancelledAt: string;
  completedAt: string;
  internalNotes: string;
  schemaVersion: number;
  // Milestone 4: blank at append time ("" — outcome not known yet), filled
  // in moments later once the notification attempts resolve. See
  // notificationStatus.ts and docs/notifications.md §7.
  customerConfirmationStatus: string;
  internalNotificationStatus: string;
  notificationAttemptAt: string;
};

// SERVER-ONLY. Types for the booking submission pipeline: the raw,
// untrusted JSON body (BookingSubmissionInput), the fully-validated result
// (ValidatedBooking), and the final persisted shape (BookingRecord).
import "server-only";
import type {
  AccessId,
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
  // Milestone 6 amendment: replaces arrivalWindow for new bookings — a
  // canonical "HH:00" 24-hour string (see lib/booking/schedule.ts's
  // isPlausibleExactTimeFormat). Arrival Window selection no longer
  // exists in the booking flow going forward.
  serviceStartTime?: unknown;

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

  // Milestone 5: the SetupIntent confirmed during the Payment step of the
  // two-phase submission. Never trusted as proof of anything by itself —
  // validateSubmission.ts only checks it's a plausible Stripe ID string;
  // bookingService.ts re-verifies it against Stripe directly (status
  // "succeeded", has a Customer + PaymentMethod) before this booking is
  // ever persisted. See docs/payments.md.
  setupIntentId?: unknown;

  // Required (true) when frequency is recurring: the customer's explicit
  // consent to automatically scheduled ongoing appointments and automatic
  // per-visit charges to the saved card. Stored on the recurring schedule
  // together with the consent wording version.
  recurringConsent?: unknown;

  // Client-displayed values: the server never uses them to price, only to
  // refuse a submission whose shown total differs from the authoritative
  // one (see bookingService.ts), so a customer is never charged an amount
  // other than the one they confirmed.
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
  serviceStartTime: string; // "HH:00", 24-hour

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
  setupIntentId: string;
  /** True only when the customer gave the recurring-schedule consent (always false for one-time). */
  recurringConsent: boolean;
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
  // Milestone 5: see docs/payments.md for the full field-by-field
  // rationale. Set once at appendBooking() time from the verified
  // SetupIntent (stripeCustomerId/stripePaymentMethodId/stripeSetupIntentId,
  // scheduledChargeAt, originalBookingTotal, chargeAmount) and never
  // touched again by the booking-submission path; everything else here is
  // owned by the payment-processing endpoint (paymentAttemptCount through
  // paymentFailureCode) or by BeLa staff editing the sheet directly
  // (manualAmountOverride, manualAmountOverrideAt).
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  stripeSetupIntentId: string;
  scheduledChargeAt: string;
  originalBookingTotal: number;
  chargeAmount: number;
  paymentAttemptCount: number;
  lastPaymentAttemptAt: string;
  nextPaymentAttemptAt: string;
  paymentFailureCode: string;
  manualAmountOverride: boolean;
  manualAmountOverrideAt: string;
  // Milestone 6: see docs/manage-booking.md. manageBookingTokenHash is set
  // once at appendBooking() time (SHA-256 of the token minted for this
  // booking's Manage Booking link — the raw token itself is never
  // persisted). cancellationFeeAmount/rescheduledAt/originalServiceDate/
  // originalArrivalWindow all start blank and are owned exclusively by
  // cancellationService.ts / reschedulingService.ts.
  manageBookingTokenHash: string;
  cancellationFeeAmount: number;
  rescheduledAt: string;
  originalServiceDate: string;
  originalArrivalWindow: string;
  // Milestone 6 amendment: see docs/manage-booking.md. appointmentReminderStatus/
  // SentAt/Attempts are owned exclusively by reminderService.ts.
  // serviceStartTime is set once at appendBooking() time for new bookings
  // (blank for any row created before this amendment) and thereafter only
  // ever written by reschedulingService.ts, which also clears
  // arrivalWindow the moment any booking — exact-time or legacy — is
  // rescheduled. originalServiceStartTime mirrors originalArrivalWindow's
  // populate-once-on-first-reschedule-only rule.
  appointmentReminderStatus: string;
  appointmentReminderSentAt: string;
  appointmentReminderAttempts: number;
  serviceStartTime: string;
  originalServiceStartTime: string;
  // Post-verification fix: a second, independent Manage Booking token
  // minted at reminder-send time so the reminder email can carry its own
  // working link without ever recovering or rotating the original token
  // (which is unrecoverable by design). Blank until the first reminder
  // attempt; re-minted (hash overwritten) on every attempt thereafter.
  // Owned exclusively by reminderService.ts. See docs/manage-booking.md.
  manageBookingReminderTokenHash: string;
  // Square-footage price modifier (see SQUARE_FOOTAGE_OPTIONS in config.ts).
  // Appended as the last Bookings column; blank/0 on every row created
  // before it existed, which is correct — those bookings were priced
  // without it, and their Subtotal/Total/Charge Amount are never recomputed.
  squareFootagePrice: number;
  // First-cleaning-at-full-price policy (see lib/booking/recurringPricing.ts).
  // pricingPolicy: FIRST_VISIT_PRICING_POLICY for rows created under the
  // rule; "" for every earlier row, which keeps its original policy and is
  // never repriced. recurringScheduleId: groups the visits of one
  // recurring schedule (the initial booking's own Booking ID; a follow-up
  // carries the schedule it continues); "" for one-time and legacy rows.
  pricingPolicy: string;
  recurringScheduleId: string;
  /** 1-based position within the recurring schedule; 0 when not part of one (blank in the sheet). */
  occurrenceNumber: number;
};

/** Written by cancellationService.ts the moment a cancellation is confirmed — before any Stripe call. */
export type BookingCancellationInitiateUpdate = {
  paymentStatus: string; // Cancelled — No Charge, or Cancellation Fee Processing
  cancelledAt: string;
  cancellationFeeAmount: number; // dollars; 0 for a free cancellation
};

/** Written by cancellationService.ts after attempting (or being told the result of) the cancellation-fee PaymentIntent. */
export type CancellationFeeOutcomeUpdate = {
  paymentStatus: string;
  stripePaymentIntentId: string;
  paidAt: string;
};

/**
 * Written by reschedulingService.ts on a successful reschedule.
 * `arrivalWindow` is always written as "" going forward — a reschedule
 * always makes `serviceStartTime` the row's sole authoritative current
 * time, even if the booking started out as a legacy arrival-window row.
 * `originalServiceDate`/`originalArrivalWindow`/`originalServiceStartTime`
 * are always written (never omitted) — the caller decides whether this is
 * "capture the true original now" (first reschedule) or "preserve what
 * was already there" (a later reschedule), see reschedulingService.ts.
 */
export type BookingRescheduleUpdate = {
  serviceDate: string;
  arrivalWindow: string;
  serviceStartTime: string;
  scheduledChargeAt: string;
  rescheduledAt: string;
  originalServiceDate: string;
  originalArrivalWindow: string;
  originalServiceStartTime: string;
};

/**
 * Written by reminderService.ts after every reminder attempt (success,
 * retry, or permanent failure). `manageBookingReminderTokenHash` is
 * always the hash of whatever reminder token was minted for *this*
 * attempt — written regardless of outcome, since the token must exist in
 * the email body before the send is even attempted.
 */
export type AppointmentReminderUpdate = {
  appointmentReminderStatus: string;
  appointmentReminderSentAt: string; // blank unless this attempt succeeded
  appointmentReminderAttempts: number;
  manageBookingReminderTokenHash: string;
};

/**
 * The reminder-relevant slice of a booking row, re-read fresh from Sheets
 * by reminderService.ts for every attempt — mirrors BookingPaymentState's
 * role for the payment scheduler. `scheduledChargeAt` +
 * `estimatedDurationMinutes` are enough to derive the booking's real
 * service start via pure arithmetic (see reminderService.ts) without
 * needing a second DST-aware conversion server-side, and without Apps
 * Script ever needing one either.
 */
export type BookingReminderState = {
  bookingId: string;
  bookingStatus: string;
  appointmentReminderStatus: string;
  appointmentReminderAttempts: number;
  scheduledChargeAt: string;
  estimatedDurationMinutes: number;
};

/**
 * The payment-relevant slice of a booking row, re-read fresh from Sheets
 * by the payment-processing endpoint for every attempt — this is the
 * authoritative state the endpoint decides from, never anything the
 * scheduler (or any other caller) asserts about the booking directly.
 */
export type BookingPaymentState = {
  bookingId: string;
  bookingStatus: string;
  paymentStatus: string;
  serviceDate: string;
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  /** The most recent PaymentIntent recorded for this booking, if any — used to
   * verify against Stripe directly before ever initiating a new charge (see
   * paymentProcessingService.ts's idempotency guard), never trusted on its own. */
  stripePaymentIntentId: string;
  scheduledChargeAt: string;
  originalBookingTotal: number;
  chargeAmount: number;
  paymentAttemptCount: number;
  nextPaymentAttemptAt: string;
  manualAmountOverride: boolean;
  /** Recurring-schedule linkage, read so a charge can be refused for a duplicated occurrence. */
  recurringScheduleId: string;
  occurrenceNumber: number;
};

/**
 * Milestone 7: a lightweight, non-cancelled/upcoming-booking summary for
 * the internal cleaner-assignment UI's booking picker — deliberately
 * narrow (never customer email/phone/Stripe fields) since this powers a
 * page BeLa uses to pick which booking to assign a cleaner to, not a
 * general booking-data export. See assignmentService.ts's
 * listAssignableBookings.
 */
export type AssignableBookingSummary = {
  bookingId: string;
  bookingStatus: string;
  firstName: string;
  streetAddress: string;
  apartmentOrUnit: string;
  city: string;
  state: string;
  zipCode: string;
  serviceDate: string;
  arrivalWindow: string;
  serviceStartTime: string;
  cleaningType: string;
  chargeAmount: number;
};

/** Written back by the payment-processing endpoint after every attempt. */
export type PaymentAttemptUpdate = {
  paymentStatus: string;
  stripePaymentIntentId: string;
  paidAt: string;
  paymentAttemptCount: number;
  lastPaymentAttemptAt: string;
  nextPaymentAttemptAt: string;
  paymentFailureCode: string;
};

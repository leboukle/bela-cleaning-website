// SERVER-ONLY. Automatic recurring appointments.
//
// Model: one persistent schedule record (Recurring Schedules sheet) per
// recurring booking, and each appointment an ordinary Bookings row linked
// by Recurring Schedule ID + Occurrence Number. At most ONE upcoming
// non-cancelled appointment exists per schedule. The next one is created
// when the current visit's service date has passed in America/New_York AND
// its payment is confirmed successful (the existing authoritative Payment
// Status "Paid") — no manual completion — or immediately when the current
// one is cancelled / closed as unperformed. A pending, retrying or
// requires-action payment waits; a final failure pauses and alerts. The
// reconciliation scheduler (every 30 minutes) is what notices a payment
// that succeeded, and recovers any missed trigger.
//
// ALL appointment creation goes through generateNextOccurrence — the one
// serialized path. Why it is safe across concurrent serverless requests
// (an in-process lock or a check-then-append is NOT — two instances never
// share memory, and Sheets has no unique constraint):
//
//   append-then-arbitrate. A request builds the appointment, APPENDS it,
//   then re-reads the schedule's rows in SHEET ORDER. The first row for an
//   occurrence number is the only valid one — rows are assigned strictly
//   in append order by Sheets, so every concurrent request, on any
//   instance, reaches the same verdict. A loser voids its own row as a
//   free, no-charge cancellation and sends nothing. A crash after the
//   append leaves a valid row that recovery adopts (progress is repaired
//   from the Bookings rows themselves); a crash before it leaves nothing.
//
// Layered backstops: the pre-charge guard in paymentProcessingService.ts
// refuses to charge any row that is not the first for its occurrence, and
// reconcileSchedule voids stray duplicates. One-time side effects (customer
// confirmation, owner alerts) are arbitrated the same way via claimOnce.
import "server-only";
import { BOOKING_STATUS, PAYMENT_STATUS } from "./bookingsSheetSchema";
import { generateBookingId } from "./bookingId";
import { generateManageToken, hashManageToken, isPlausibleManageToken } from "./manageToken";
import { calculateScheduledChargeAt, CHARGE_DELAY_AFTER_END_MINUTES } from "./scheduledCharge";
import { checkExactTimeAvailability } from "./availability";
import { getBookingSettings } from "./settings";
import { formatOperationalTimestamp } from "./dateUtils";
import { NOTIFICATION_STATUS } from "./notificationStatus";
import { cancelBookingById, type CancelBookingResult, type CancellationNotificationSender } from "./cancellationService";
import { getBookingTimingStatus, calculateLateCancellationFeeCents } from "./cancellationPolicy";
import type { NotificationResult } from "./notificationService";
import type { BookingRepository, ScheduleBookingRow } from "./repository";
import type { RecurringScheduleRepository } from "./recurringScheduleRepository";
import {
  ENDED_REASON,
  EVENT_TYPE,
  REVIEW_REASON,
  SCHEDULE_STATUS,
  type RecurringScheduleRecord,
} from "./recurringScheduleSchema";
import type { BookingRecord } from "./types";
import { getFrequencyOption } from "@/lib/booking/config";
import { getFrequencyIdForLabel, getOccurrenceDateKey } from "@/lib/booking/recurrence";
import {
  FIRST_VISIT_PRICING_POLICY,
  RECURRING_CONSENT_VERSION,
  priceAgreedOccurrence,
  type AgreedSchedulePricing,
} from "@/lib/booking/recurringPricing";
import { getScheduleDisplayLabel } from "@/lib/booking/schedule";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecurringAlert = {
  /** Stable machine code, also the REVIEW_REASON value where one applies. */
  code: string;
  headline: string;
  detail: string;
  occurrenceNumber?: number;
};

// Includes the cancellation senders because ending a schedule cancels its
// upcoming appointment through the existing cancellation service.
export type RecurringNotificationSender = {
  sendRecurringAppointmentScheduled(record: BookingRecord, manageToken: string): Promise<NotificationResult>;
  sendInternalRecurringAppointmentCreated(record: BookingRecord): Promise<NotificationResult>;
  sendInternalRecurringScheduleAlert(schedule: RecurringScheduleRecord, alert: RecurringAlert): Promise<NotificationResult>;
} & CancellationNotificationSender;

export type RecurringDeps = {
  bookings: BookingRepository;
  schedules: RecurringScheduleRepository;
  notifications: RecurringNotificationSender;
};

export type GenerationOutcome =
  | { outcome: "created"; scheduleId: string; bookingId: string; occurrenceNumber: number; serviceDate: string }
  | { outcome: "schedule-not-found" }
  | { outcome: "schedule-not-active"; status: string }
  | { outcome: "has-open-appointment"; bookingId: string; occurrenceNumber: number }
  | { outcome: "lost-race"; occurrenceNumber: number }
  | { outcome: "needs-review"; reason: string; occurrenceNumber: number; serviceDate: string }
  | { outcome: "paused"; reason: string };

// A visit whose date has passed but whose payment is still Scheduled /
// Processing / Requires Action this long after it ended is reported to the
// owner (the normal charge fires one hour after the end, so this means the
// payment pipeline is stuck). Retrying and failed payments are NOT reported
// here: retries are working, and a final failure pauses + alerts on its own.
export const PAYMENT_NOT_CONFIRMED_GRACE_MS = 48 * 60 * 60 * 1000;

/** The business-timezone calendar date (yyyy-mm-dd) of an instant. */
export function localDateKey(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const SCHEDULE_SOURCE = "Recurring schedule";

// Each once-only notification/alert may be attempted at most this many times
// in total (a crash or failed send after a claim is retried by reconcile).
const MAX_NOTIFY_ATTEMPTS = 3;

function logError(step: string, id: string, error: unknown): void {
  console.error(`[recurringScheduleService] ${step} failed: id=${id}`, error instanceof Error ? error.message : "unknown error");
}

function listRows(deps: RecurringDeps, scheduleId: string): Promise<ScheduleBookingRow[]> {
  if (!deps.bookings.listScheduleBookings) {
    throw new Error("The booking repository does not support recurring schedules.");
  }
  return deps.bookings.listScheduleBookings(scheduleId);
}

/** Rows that carry an occurrence number, in sheet order. */
function occurrenceRows(rows: ScheduleBookingRow[]): ScheduleBookingRow[] {
  return rows.filter((r) => r.occurrenceNumber > 0);
}

/** The FIRST row (sheet order) for each occurrence number — the only valid one. */
function canonicalRows(rows: ScheduleBookingRow[]): ScheduleBookingRow[] {
  const seen = new Set<number>();
  const result: ScheduleBookingRow[] = [];
  for (const row of occurrenceRows(rows)) {
    if (seen.has(row.occurrenceNumber)) continue;
    seen.add(row.occurrenceNumber);
    result.push(row);
  }
  return result;
}

/**
 * A SERVICE visit that was successfully paid for: not cancelled, and its
 * Payment Status — the existing authoritative status, written by the Stripe
 * webhook and self-healed by the payment endpoint — is Paid. A payment
 * ATTEMPT is not enough (Processing / Retry Scheduled / Requires Action),
 * and a late-cancellation fee never counts: a late-cancelled visit is
 * Cancelled, its Payment Status being a Cancellation Fee state.
 */
export function isServicePaid(row: ScheduleBookingRow): boolean {
  return row.bookingStatus !== BOOKING_STATUS.CANCELLED && row.paymentStatus === PAYMENT_STATUS.PAID;
}

/** Not yet charged and not cancelled: what a customer's stop / an owner's end cancels. */
function isUnbilledUpcoming(row: ScheduleBookingRow): boolean {
  return row.bookingStatus !== BOOKING_STATUS.CANCELLED && row.paymentStatus === PAYMENT_STATUS.SCHEDULED;
}

/**
 * An appointment that still blocks the NEXT one. It stops blocking when it is
 *  - cancelled (customer cancellation, or an owner's unperformed mark — both
 *    advance the schedule immediately), or
 *  - successfully paid AND its service date has passed in the business
 *    timezone (no manual completion needed), or
 *  - a payment that ended in Final Failure which the owner has acknowledged
 *    by resuming the schedule (it never qualifies for the discount).
 * Anything else — including a paid visit on its own date, and a payment that
 * is pending, retrying or requires action — waits.
 */
function isOpen(row: ScheduleBookingRow, todayKey: string, acknowledgedFailures: ReadonlySet<string>): boolean {
  if (row.bookingStatus === BOOKING_STATUS.CANCELLED) return false;
  if (isServicePaid(row) && row.serviceDate !== "" && row.serviceDate < todayKey) return false;
  if (row.paymentStatus === PAYMENT_STATUS.FINAL_FAILURE && acknowledgedFailures.has(row.bookingId)) return false;
  return true;
}

async function acknowledgedFailureIds(deps: Pick<RecurringDeps, "schedules">, rows: ScheduleBookingRow[]): Promise<Set<string>> {
  const acknowledged = new Set<string>();
  for (const row of rows) {
    if (row.bookingStatus === BOOKING_STATUS.CANCELLED || row.paymentStatus !== PAYMENT_STATUS.FINAL_FAILURE) continue;
    if (await deps.schedules.hasClaim(`payfail-ack:${row.bookingId}`)) acknowledged.add(row.bookingId);
  }
  return acknowledged;
}

/** The schedule's appointments that currently block the next one, lowest occurrence first. */
export async function findOpenAppointments(
  deps: Pick<RecurringDeps, "schedules">,
  rows: ScheduleBookingRow[],
  timezone: string,
  now: Date,
): Promise<ScheduleBookingRow[]> {
  const canonical = canonicalRows(rows);
  const todayKey = localDateKey(now, timezone || "America/New_York");
  const acknowledged = await acknowledgedFailureIds(deps, canonical);
  return canonical.filter((r) => isOpen(r, todayKey, acknowledged)).sort((a, b) => a.occurrenceNumber - b.occurrenceNumber);
}

function highestOccurrence(rows: ScheduleBookingRow[]): number {
  return occurrenceRows(rows).reduce((max, r) => Math.max(max, r.occurrenceNumber), 0);
}

function serviceEndOf(row: ScheduleBookingRow): Date | null {
  if (!row.scheduledChargeAt) return null;
  const chargeAt = new Date(row.scheduledChargeAt);
  if (Number.isNaN(chargeAt.getTime())) return null;
  return new Date(chargeAt.getTime() - CHARGE_DELAY_AFTER_END_MINUTES * 60_000);
}

// ---------------------------------------------------------------------------
// Schedule creation
// ---------------------------------------------------------------------------

function agreedPricingOf(schedule: RecurringScheduleRecord): AgreedSchedulePricing {
  return {
    baseCleaningPrice: schedule.baseCleaningPrice,
    bathroomPrice: schedule.bathroomPrice,
    squareFootagePrice: schedule.squareFootagePrice,
    cleaningTypePrice: schedule.cleaningTypePrice,
    extrasPrice: schedule.extrasPrice,
    frequencyRate: schedule.frequencyRate,
  };
}

/**
 * Builds the schedule record for a recurring INITIAL appointment from its
 * own saved Bookings row — the row is the single source of what was agreed
 * (full-price components, details, Stripe references), which is also what
 * lets a lost schedule row be recreated exactly (repairMissingSchedule).
 */
export function buildScheduleFromInitialBooking(
  record: BookingRecord,
  consentGiven: boolean,
  timezone: string,
): RecurringScheduleRecord {
  const frequencyId = getFrequencyIdForLabel(record.frequency);
  if (!frequencyId || frequencyId === "one-time") {
    throw new Error("A recurring schedule requires a recurring frequency.");
  }
  const agreed: AgreedSchedulePricing = {
    baseCleaningPrice: record.baseCleaningPrice,
    bathroomPrice: record.bathroomPrice,
    squareFootagePrice: record.squareFootagePrice,
    cleaningTypePrice: record.cleaningTypePrice,
    extrasPrice: record.extrasPrice,
    frequencyRate: getFrequencyOption(frequencyId).discount,
  };
  return {
    scheduleId: record.bookingId,
    status: SCHEDULE_STATUS.ACTIVE,
    reviewReason: "",
    reviewSince: "",
    frequency: record.frequency,
    frequencyRate: agreed.frequencyRate,
    anchorDate: record.serviceDate,
    anchorStartTime: record.serviceStartTime,
    timezone,
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    mobile: record.mobile,
    streetAddress: record.streetAddress,
    apartmentOrUnit: record.apartmentOrUnit,
    city: record.city,
    state: record.state,
    zipCode: record.zipCode,
    someoneHome: record.someoneHome,
    propertyType: record.propertyType,
    squareFootage: record.squareFootage,
    bedrooms: record.bedrooms,
    bathrooms: record.bathrooms,
    cleaningType: record.cleaningType,
    extras: record.extras,
    estimatedDurationMinutes: record.estimatedDurationMinutes,
    specialInstructions: record.specialInstructions,
    baseCleaningPrice: agreed.baseCleaningPrice,
    bathroomPrice: agreed.bathroomPrice,
    squareFootagePrice: agreed.squareFootagePrice,
    cleaningTypePrice: agreed.cleaningTypePrice,
    extrasPrice: agreed.extrasPrice,
    fullPriceTotal: priceAgreedOccurrence(agreed, false).totalPrice,
    recurringPriceTotal: priceAgreedOccurrence(agreed, true).totalPrice,
    pricingPolicy: FIRST_VISIT_PRICING_POLICY,
    stripeCustomerId: record.stripeCustomerId,
    stripePaymentMethodId: record.stripePaymentMethodId,
    stripeSetupIntentId: record.stripeSetupIntentId,
    consentVersion: consentGiven ? RECURRING_CONSENT_VERSION : "",
    consentAt: consentGiven ? record.submittedAt : "",
    sourceBookingId: record.bookingId,
    createdAt: formatOperationalTimestamp(new Date()),
    nextOccurrenceNumber: 2,
    lastOccurrenceNumber: 1,
    lastBookingId: record.bookingId,
    lastGeneratedAt: record.submittedAt,
    endedAt: "",
    endedReason: "",
  };
}

/** Called right after a recurring initial booking is appended. Idempotent. */
export async function createScheduleFromInitialBooking(
  record: BookingRecord,
  consentGiven: boolean,
  schedules: RecurringScheduleRepository,
  timezone: string,
): Promise<{ created: boolean }> {
  const schedule = buildScheduleFromInitialBooking(record, consentGiven, timezone);
  const result = await schedules.createSchedule(schedule);
  if (result.created) {
    await schedules.appendEvent({
      timestamp: formatOperationalTimestamp(new Date()),
      scheduleId: schedule.scheduleId,
      occurrenceNumber: 1,
      eventType: EVENT_TYPE.SCHEDULE_CREATED,
      detail: `${schedule.frequency}; anchor ${schedule.anchorDate} ${schedule.anchorStartTime}`,
    });
  }
  return result;
}

/**
 * Recreates a schedule row that was lost between the initial booking's
 * append and the schedule write (a crash). Only ever applies to a NEW-model
 * initial appointment — occurrence number 1 whose Recurring Schedule ID is
 * its own Booking ID. Existing frequency-labelled bookings (no occurrence
 * number) are deliberately never auto-converted.
 */
export async function repairMissingSchedule(
  bookingId: string,
  deps: RecurringDeps,
): Promise<{ repaired: boolean }> {
  const record = await deps.bookings.getFullBookingRecord(bookingId);
  if (!record) return { repaired: false };
  if (record.occurrenceNumber !== 1 || record.recurringScheduleId !== record.bookingId) return { repaired: false };
  const settings = await getBookingSettings();
  const schedule = buildScheduleFromInitialBooking(record, true, settings.timezone);
  const { created } = await deps.schedules.createSchedule(schedule);
  if (created) {
    await deps.schedules.appendEvent({
      timestamp: formatOperationalTimestamp(new Date()),
      scheduleId: schedule.scheduleId,
      occurrenceNumber: 1,
      eventType: EVENT_TYPE.SCHEDULE_REPAIRED,
      detail: "Schedule row recreated from the initial appointment's own row.",
    });
  }
  return { repaired: created };
}

// ---------------------------------------------------------------------------
// Review flags and alerts
// ---------------------------------------------------------------------------

async function flagForReview(
  deps: RecurringDeps,
  schedule: RecurringScheduleRecord,
  alert: RecurringAlert,
  options: { pause?: boolean; now: Date },
): Promise<void> {
  const patch: Partial<RecurringScheduleRecord> = {};
  if (schedule.reviewReason !== alert.code) {
    patch.reviewReason = alert.code;
    patch.reviewSince = formatOperationalTimestamp(options.now);
  }
  if (options.pause && schedule.status === SCHEDULE_STATUS.ACTIVE) patch.status = SCHEDULE_STATUS.PAUSED;
  if (Object.keys(patch).length > 0) {
    try {
      await deps.schedules.updateSchedule(schedule.scheduleId, patch);
    } catch (error) {
      logError("updateSchedule (review flag)", schedule.scheduleId, error);
    }
  }

  // The owner is told ONCE per (schedule, occurrence, issue). A successful
  // send is recorded as an "alert-sent" claim; until then each attempt takes
  // its own numbered claim (arbitrated across concurrent runs), so a crash
  // or send failure after a claim is retried by the next reconcile instead
  // of being lost — bounded at MAX_NOTIFY_ATTEMPTS.
  const base = `${schedule.scheduleId}:${alert.occurrenceNumber ?? 0}:${alert.code}`;
  try {
    if (!(await deps.schedules.hasClaim(`alert-sent:${base}`))) {
      const attempt = (await deps.schedules.countClaims(`alert:${base}:`)) + 1;
      if (attempt <= MAX_NOTIFY_ATTEMPTS && (await deps.schedules.claimOnce(`alert:${base}:${attempt}`, schedule.scheduleId, alert.headline, options.now))) {
        const sent = await deps.notifications.sendInternalRecurringScheduleAlert(schedule, alert);
        if (sent.ok) {
          await deps.schedules.appendEvent({
            timestamp: formatOperationalTimestamp(options.now),
            scheduleId: schedule.scheduleId,
            occurrenceNumber: alert.occurrenceNumber ?? "",
            eventType: EVENT_TYPE.CLAIM,
            claimKey: `alert-sent:${base}`,
            detail: alert.headline,
          });
        }
      }
    }
    await deps.schedules.appendEvent({
      timestamp: formatOperationalTimestamp(options.now),
      scheduleId: schedule.scheduleId,
      occurrenceNumber: alert.occurrenceNumber ?? "",
      eventType: options.pause ? EVENT_TYPE.SCHEDULE_PAUSED : EVENT_TYPE.GENERATION_BLOCKED,
      detail: `${alert.code}: ${alert.detail}`.slice(0, 500),
    });
  } catch (error) {
    logError("owner alert", schedule.scheduleId, error);
  }
}

function reviewReasonForAvailability(reason: string | null): string {
  if (reason === "blackout") return REVIEW_REASON.BLACKOUT;
  if (reason === "too-soon") return REVIEW_REASON.TOO_SOON;
  return REVIEW_REASON.UNAVAILABLE;
}

// ---------------------------------------------------------------------------
// Generation — the one serialized creation path
// ---------------------------------------------------------------------------

function buildOccurrenceRecord(
  schedule: RecurringScheduleRecord,
  bookingId: string,
  occurrenceNumber: number,
  serviceDate: string,
  priced: { subtotal: number; frequencyDiscount: number; totalPrice: number },
  scheduledChargeAt: Date,
  manageTokenHash: string,
  schemaVersion: number,
  now: Date,
): BookingRecord {
  return {
    bookingId,
    submittedAt: formatOperationalTimestamp(now),
    bookingStatus: BOOKING_STATUS.PENDING_PAYMENT,
    paymentStatus: PAYMENT_STATUS.SCHEDULED,
    firstName: schedule.firstName,
    lastName: schedule.lastName,
    email: schedule.email,
    mobile: schedule.mobile,
    streetAddress: schedule.streetAddress,
    apartmentOrUnit: schedule.apartmentOrUnit,
    city: schedule.city,
    state: schedule.state,
    zipCode: schedule.zipCode,
    someoneHome: schedule.someoneHome,
    serviceDate,
    arrivalWindow: "",
    propertyType: schedule.propertyType,
    squareFootage: schedule.squareFootage,
    bedrooms: schedule.bedrooms,
    bathrooms: schedule.bathrooms,
    cleaningType: schedule.cleaningType,
    extras: schedule.extras,
    frequency: schedule.frequency,
    baseCleaningPrice: schedule.baseCleaningPrice,
    bathroomPrice: schedule.bathroomPrice,
    squareFootagePrice: schedule.squareFootagePrice,
    cleaningTypePrice: schedule.cleaningTypePrice,
    extrasPrice: schedule.extrasPrice,
    subtotal: priced.subtotal,
    frequencyDiscount: priced.frequencyDiscount,
    totalPrice: priced.totalPrice,
    estimatedDurationMinutes: schedule.estimatedDurationMinutes,
    specialInstructions: schedule.specialInstructions,
    policyAccepted: true,
    submissionSource: SCHEDULE_SOURCE,
    stripeCheckoutSessionId: "",
    stripePaymentIntentId: "",
    paidAt: "",
    cancelledAt: "",
    completedAt: "",
    internalNotes: `recurring:${schedule.scheduleId}#${occurrenceNumber}`,
    schemaVersion,
    customerConfirmationStatus: "",
    internalNotificationStatus: "",
    notificationAttemptAt: "",
    stripeCustomerId: schedule.stripeCustomerId,
    stripePaymentMethodId: schedule.stripePaymentMethodId,
    stripeSetupIntentId: schedule.stripeSetupIntentId,
    scheduledChargeAt: scheduledChargeAt.toISOString(),
    originalBookingTotal: priced.totalPrice,
    chargeAmount: priced.totalPrice,
    paymentAttemptCount: 0,
    lastPaymentAttemptAt: "",
    nextPaymentAttemptAt: "",
    paymentFailureCode: "",
    manualAmountOverride: false,
    manualAmountOverrideAt: "",
    manageBookingTokenHash: manageTokenHash,
    cancellationFeeAmount: 0,
    rescheduledAt: "",
    originalServiceDate: "",
    originalArrivalWindow: "",
    appointmentReminderStatus: "",
    appointmentReminderSentAt: "",
    appointmentReminderAttempts: 0,
    serviceStartTime: schedule.anchorStartTime,
    originalServiceStartTime: "",
    manageBookingReminderTokenHash: "",
    pricingPolicy: schedule.pricingPolicy,
    recurringScheduleId: schedule.scheduleId,
    occurrenceNumber,
  };
}

async function voidAppointment(
  deps: RecurringDeps,
  schedule: RecurringScheduleRecord,
  bookingId: string,
  occurrenceNumber: number,
  why: string,
  now: Date,
): Promise<void> {
  // A free, no-charge cancellation: Booking Status Cancelled and Payment
  // Status "Cancelled — No Charge", exactly as a >24h customer cancellation
  // — so it can never be charged, reminded or counted for capacity.
  await deps.bookings.markBookingCancelled(bookingId, {
    paymentStatus: PAYMENT_STATUS.CANCELLED_NO_CHARGE,
    cancelledAt: formatOperationalTimestamp(now),
    cancellationFeeAmount: 0,
  });
  try {
    await deps.schedules.appendEvent({
      timestamp: formatOperationalTimestamp(now),
      scheduleId: schedule.scheduleId,
      occurrenceNumber,
      eventType: EVENT_TYPE.DUPLICATE_VOIDED,
      detail: `${bookingId}: ${why}`,
    });
  } catch (error) {
    logError("appendEvent (void)", bookingId, error);
  }
}

/**
 * Sends the customer's new-appointment confirmation and the owner's
 * "needs assignment" notice — each at most once, however many requests or
 * recovery runs reach this point (claimOnce). `manageToken` is the raw
 * token minted at creation; when absent (recovery after a crash that lost
 * it) a fresh token is minted and its hash stored — safe, because the
 * original was never delivered.
 */
export async function ensureAppointmentNotifications(
  deps: RecurringDeps,
  schedule: RecurringScheduleRecord,
  bookingId: string,
  manageToken: string | null,
  now: Date,
): Promise<void> {
  // Attempt-numbered claim: concurrent callers race on the SAME attempt key
  // (exactly one wins); a later caller — after a crash or a failed send —
  // takes the next attempt, so nothing is lost and a sent email is never
  // re-sent (only the channels whose status is not "Sent" are retried).
  const attempt = (await deps.schedules.countClaims(`notify-created:${bookingId}:`)) + 1;
  if (attempt > MAX_NOTIFY_ATTEMPTS) return;
  const claimed = await deps.schedules.claimOnce(`notify-created:${bookingId}:${attempt}`, schedule.scheduleId, bookingId, now);
  if (!claimed) return;

  let record = await deps.bookings.getFullBookingRecord(bookingId);
  if (!record || record.bookingStatus === BOOKING_STATUS.CANCELLED) return;
  const customerAlreadySent = record.customerConfirmationStatus === NOTIFICATION_STATUS.SENT;
  const internalAlreadySent = record.internalNotificationStatus === NOTIFICATION_STATUS.SENT;
  if (customerAlreadySent && internalAlreadySent) return;

  // Only re-issue a link when the customer email still has to go out; a link
  // that was already delivered must never be invalidated by a retry.
  let token = manageToken;
  if (!token && !customerAlreadySent) {
    token = generateManageToken();
    if (!deps.bookings.updateManageTokenHash) throw new Error("Repository cannot re-issue Manage Booking links.");
    await deps.bookings.updateManageTokenHash(bookingId, hashManageToken(token));
    record = { ...record, manageBookingTokenHash: hashManageToken(token) };
  }

  const skipped = Promise.resolve<NotificationResult>({ ok: true });
  const [customerResult, internalResult] = await Promise.allSettled([
    customerAlreadySent ? skipped : deps.notifications.sendRecurringAppointmentScheduled(record, token ?? ""),
    internalAlreadySent ? skipped : deps.notifications.sendInternalRecurringAppointmentCreated(record),
  ]);
  const ok = (r: PromiseSettledResult<NotificationResult>) => r.status === "fulfilled" && r.value.ok;
  try {
    await deps.bookings.updateNotificationStatus(bookingId, {
      customerConfirmationStatus: ok(customerResult) ? NOTIFICATION_STATUS.SENT : NOTIFICATION_STATUS.FAILED,
      internalNotificationStatus: ok(internalResult) ? NOTIFICATION_STATUS.SENT : NOTIFICATION_STATUS.FAILED,
      notificationAttemptAt: formatOperationalTimestamp(now),
    });
  } catch (error) {
    logError("updateNotificationStatus", bookingId, error);
  }
}

/**
 * Creates the schedule's next appointment, if and only if it should exist.
 * Safe to call any number of times, from any trigger (completion,
 * cancellation, reconciliation, owner action) — it re-derives everything
 * from stored state and either creates exactly one appointment or does
 * nothing. Never silently shifts, skips or bypasses availability: an
 * unavailable / blacked-out / too-soon date flags the schedule for owner
 * review and creates nothing.
 */
export async function generateNextOccurrence(
  scheduleId: string,
  deps: RecurringDeps,
  now: Date = new Date(),
): Promise<GenerationOutcome> {
  const schedule = await deps.schedules.getSchedule(scheduleId);
  if (!schedule) return { outcome: "schedule-not-found" };
  if (schedule.status !== SCHEDULE_STATUS.ACTIVE) return { outcome: "schedule-not-active", status: schedule.status };

  const rows = await listRows(deps, scheduleId);
  const canonical = canonicalRows(rows);

  // Final payment failure on the most recent appointment pauses the
  // series until the owner acknowledges it (resumeSchedule).
  const latest = canonical.reduce<ScheduleBookingRow | null>(
    (best, r) => (!best || r.occurrenceNumber > best.occurrenceNumber ? r : best),
    null,
  );
  if (latest && latest.bookingStatus !== BOOKING_STATUS.CANCELLED && latest.paymentStatus === PAYMENT_STATUS.FINAL_FAILURE) {
    const acknowledged = await deps.schedules.hasClaim(`payfail-ack:${latest.bookingId}`);
    if (!acknowledged) {
      await flagForReview(
        deps,
        schedule,
        {
          code: REVIEW_REASON.PAYMENT_FINAL_FAILURE,
          headline: "Recurring cleanings paused: payment failed",
          detail: `Appointment ${latest.bookingId} (#${latest.occurrenceNumber}) ended in Final Failure. No further appointments will be created until you resume the schedule.`,
          occurrenceNumber: latest.occurrenceNumber,
        },
        { pause: true, now },
      );
      return { outcome: "paused", reason: REVIEW_REASON.PAYMENT_FINAL_FAILURE };
    }
  }

  // The next appointment is due only once the current one has been paid for
  // AND its service date has passed in the business timezone (or it was
  // cancelled / owner-closed as unperformed, which advance immediately).
  const todayKey = localDateKey(now, schedule.timezone || "America/New_York");
  const acknowledged = await acknowledgedFailureIds(deps, canonical);
  const open = canonical.find((r) => isOpen(r, todayKey, acknowledged));
  if (open) return { outcome: "has-open-appointment", bookingId: open.bookingId, occurrenceNumber: open.occurrenceNumber };

  const nextN = Math.max(schedule.nextOccurrenceNumber, highestOccurrence(rows) + 1);
  const frequencyId = getFrequencyIdForLabel(schedule.frequency);
  if (!frequencyId || frequencyId === "one-time") {
    await flagForReview(
      deps,
      schedule,
      {
        code: REVIEW_REASON.GENERATION_ERROR,
        headline: "Recurring schedule has an unrecognized frequency",
        detail: `Frequency "${schedule.frequency}" is not a recurring cadence.`,
        occurrenceNumber: nextN,
      },
      { now },
    );
    return { outcome: "needs-review", reason: REVIEW_REASON.GENERATION_ERROR, occurrenceNumber: nextN, serviceDate: "" };
  }

  const serviceDate = getOccurrenceDateKey(schedule.anchorDate, frequencyId, nextN);
  const duration = schedule.estimatedDurationMinutes;

  // Same authoritative availability rules as any new booking, including
  // blackout dates, capacity and the 120-hour minimum lead time. Failure =
  // owner review, never a silent shift or bypass.
  const availability = await checkExactTimeAvailability(serviceDate, schedule.anchorStartTime, duration, now);
  if (!availability.available) {
    const code = reviewReasonForAvailability(availability.reason);
    await flagForReview(
      deps,
      schedule,
      {
        code,
        headline: `Next recurring appointment can't be created (${serviceDate})`,
        detail: `Occurrence #${nextN} falls on ${serviceDate} at ${schedule.anchorStartTime} but is unavailable (${availability.reason}). Resolve the cause (e.g. remove the blackout) and it will be created automatically, or skip this occurrence.`,
        occurrenceNumber: nextN,
      },
      { now },
    );
    return { outcome: "needs-review", reason: code, occurrenceNumber: nextN, serviceDate };
  }

  // The first PERFORMED cleaning stays full price; discounted only once at
  // least one service visit of this schedule has been successfully PAID
  // (never a cancelled / unperformed visit, never a cancellation fee).
  const performedBefore = canonical.some(isServicePaid);
  const priced = priceAgreedOccurrence(agreedPricingOf(schedule), performedBefore);

  const settings = await getBookingSettings();
  const scheduledChargeAt = calculateScheduledChargeAt(
    serviceDate,
    { hour: Number(schedule.anchorStartTime.slice(0, 2)), minute: 0 },
    duration,
    schedule.timezone || settings.timezone,
  );

  let bookingId = generateBookingId(now);
  for (let attempts = 0; await deps.bookings.bookingIdExists(bookingId); attempts++) {
    if (attempts >= 5) throw new Error("Exhausted booking ID generation attempts.");
    bookingId = generateBookingId(now);
  }

  const manageToken = generateManageToken();
  const record = buildOccurrenceRecord(
    schedule,
    bookingId,
    nextN,
    serviceDate,
    priced,
    scheduledChargeAt,
    hashManageToken(manageToken),
    settings.schemaVersion,
    now,
  );

  // Re-check immediately before the append (availability may have changed
  // while pricing and ID generation ran), then append.
  const recheck = await checkExactTimeAvailability(serviceDate, schedule.anchorStartTime, duration, now);
  if (!recheck.available) {
    return { outcome: "needs-review", reason: reviewReasonForAvailability(recheck.reason), occurrenceNumber: nextN, serviceDate };
  }
  await deps.bookings.appendBooking(record);

  // ---- Arbitration (see module header) ----
  const afterAppend = await listRows(deps, scheduleId);
  const sameOccurrence = occurrenceRows(afterAppend).filter((r) => r.occurrenceNumber === nextN);
  if (sameOccurrence[0]?.bookingId !== bookingId) {
    await voidAppointment(deps, schedule, bookingId, nextN, "lost occurrence arbitration (a row for this occurrence already existed)", now);
    return { outcome: "lost-race", occurrenceNumber: nextN };
  }
  const openAfter = canonicalRows(afterAppend).filter((r) => isOpen(r, todayKey, acknowledged));
  if (openAfter.length > 1) {
    const keeper = openAfter.reduce((a, b) => (b.occurrenceNumber < a.occurrenceNumber ? b : a));
    if (keeper.bookingId !== bookingId) {
      await voidAppointment(deps, schedule, bookingId, nextN, "another upcoming appointment already exists for this schedule", now);
      return { outcome: "lost-race", occurrenceNumber: nextN };
    }
  }
  // The schedule may have been stopped/paused while this ran: a created
  // appointment must never outlive its schedule.
  const fresh = await deps.schedules.getSchedule(scheduleId);
  if (!fresh || fresh.status !== SCHEDULE_STATUS.ACTIVE) {
    await voidAppointment(deps, schedule, bookingId, nextN, `schedule is ${fresh?.status ?? "missing"}`, now);
    return { outcome: "schedule-not-active", status: fresh?.status ?? "missing" };
  }

  // ---- Committed: record progress, then notify (once) ----
  await deps.schedules.updateSchedule(scheduleId, {
    nextOccurrenceNumber: nextN + 1,
    lastOccurrenceNumber: nextN,
    lastBookingId: bookingId,
    lastGeneratedAt: formatOperationalTimestamp(now),
    reviewReason: "",
    reviewSince: "",
  });
  try {
    await deps.schedules.appendEvent({
      timestamp: formatOperationalTimestamp(now),
      scheduleId,
      occurrenceNumber: nextN,
      eventType: EVENT_TYPE.OCCURRENCE_CREATED,
      detail: `${bookingId} on ${serviceDate} at $${priced.totalPrice}${performedBefore ? "" : " (full price: no cleaning performed yet)"}`,
    });
  } catch (error) {
    logError("appendEvent (created)", bookingId, error);
  }
  try {
    await ensureAppointmentNotifications(deps, fresh, bookingId, manageToken, now);
  } catch (error) {
    logError("ensureAppointmentNotifications", bookingId, error);
  }

  return { outcome: "created", scheduleId, bookingId, occurrenceNumber: nextN, serviceDate };
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export type AppointmentChangeOutcome = { outcome: "not-recurring" } | GenerationOutcome;

/**
 * After an appointment is cancelled or marked unperformed (and from any
 * owner "mark complete", which no longer drives generation by itself):
 * advance the schedule through the same creation path. Idempotent — a
 * repeated completion or cancellation request simply finds the appointment
 * already created.
 */
export async function afterAppointmentChanged(
  bookingId: string,
  deps: RecurringDeps,
  now: Date = new Date(),
): Promise<AppointmentChangeOutcome> {
  const record = await deps.bookings.getFullBookingRecord(bookingId);
  if (!record || !record.recurringScheduleId || record.occurrenceNumber < 1) return { outcome: "not-recurring" };
  return generateNextOccurrence(record.recurringScheduleId, deps, now);
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export type ReconcileOutcome = {
  scheduleId: string;
  repairedSchedule?: boolean;
  repairedProgress?: boolean;
  voidedDuplicates: number;
  notificationsRecovered: number;
  paymentNotConfirmed?: boolean;
  generation?: GenerationOutcome | { outcome: "skipped"; reason: string };
};

/**
 * Idempotent recovery pass for one schedule, run by the reconciliation
 * scheduler: recreates a missing schedule row, repairs progress from the
 * Bookings rows, voids stray duplicate occurrences, recovers a missed
 * confirmation, alerts on a missing completion, finishes an interrupted
 * "stop", and retries generation (which resumes through the same path once
 * a blackout/capacity issue is resolved).
 */
export async function reconcileSchedule(
  scheduleId: string,
  deps: RecurringDeps,
  now: Date = new Date(),
): Promise<ReconcileOutcome> {
  const result: ReconcileOutcome = { scheduleId, voidedDuplicates: 0, notificationsRecovered: 0 };

  let schedule = await deps.schedules.getSchedule(scheduleId);
  if (!schedule) {
    const { repaired } = await repairMissingSchedule(scheduleId, deps);
    result.repairedSchedule = repaired;
    schedule = await deps.schedules.getSchedule(scheduleId);
    if (!schedule) return { ...result, generation: { outcome: "skipped", reason: "no-schedule" } };
  }

  const rows = await listRows(deps, scheduleId);

  // Void stray duplicates (a loser that crashed before voiding itself).
  const firstByOccurrence = new Map<number, ScheduleBookingRow>();
  for (const row of occurrenceRows(rows)) {
    const first = firstByOccurrence.get(row.occurrenceNumber);
    if (!first) {
      firstByOccurrence.set(row.occurrenceNumber, row);
    } else if (row.bookingStatus !== BOOKING_STATUS.CANCELLED) {
      await voidAppointment(deps, schedule, row.bookingId, row.occurrenceNumber, "duplicate occurrence found by reconciliation", now);
      result.voidedDuplicates += 1;
    }
  }
  const canonical = canonicalRows(rows);

  // Progress repair: the Bookings rows are the truth for how far we got.
  const highest = highestOccurrence(rows);
  if (highest > 0 && (schedule.lastOccurrenceNumber < highest || schedule.nextOccurrenceNumber <= highest)) {
    const last = canonical.find((r) => r.occurrenceNumber === highest);
    await deps.schedules.updateSchedule(scheduleId, {
      nextOccurrenceNumber: Math.max(schedule.nextOccurrenceNumber, highest + 1),
      lastOccurrenceNumber: Math.max(schedule.lastOccurrenceNumber, highest),
      lastBookingId: last?.bookingId ?? schedule.lastBookingId,
    });
    schedule = (await deps.schedules.getSchedule(scheduleId)) ?? schedule;
    result.repairedProgress = true;
  }

  // Recover confirmations for generated appointments that never got them.
  for (const row of canonical) {
    if (row.occurrenceNumber < 2 || row.bookingStatus === BOOKING_STATUS.CANCELLED) continue;
    if (row.customerConfirmationStatus === NOTIFICATION_STATUS.SENT && row.internalNotificationStatus === NOTIFICATION_STATUS.SENT) continue;
    const submitted = new Date(row.submittedAt);
    const ageMs = Number.isNaN(submitted.getTime()) ? Infinity : now.getTime() - submitted.getTime();
    if (ageMs < 10 * 60_000) continue; // let an in-flight creation finish first
    try {
      await ensureAppointmentNotifications(deps, schedule, row.bookingId, null, now);
      result.notificationsRecovered += 1;
    } catch (error) {
      logError("ensureAppointmentNotifications (recovery)", row.bookingId, error);
    }
  }

  // An Ended schedule must not leave an upcoming appointment behind.
  if (schedule.status === SCHEDULE_STATUS.ENDED) {
    for (const row of canonical.filter(isUnbilledUpcoming)) {
      try {
        await finishCancellation(deps, row.bookingId, now);
      } catch (error) {
        logError("finish cancellation of ended schedule", row.bookingId, error);
      }
    }
    return { ...result, generation: { outcome: "skipped", reason: "schedule-ended" } };
  }

  // A visit whose date passed but whose payment never got going: alert the
  // owner instead of waiting silently. (Retrying and failed payments are
  // handled by the payment retry cadence and the pause-and-alert path.)
  const todayKey = localDateKey(now, schedule.timezone || "America/New_York");
  const acknowledged = await acknowledgedFailureIds(deps, canonical);
  const stuck = canonical.find(
    (r) =>
      isOpen(r, todayKey, acknowledged) &&
      r.serviceDate !== "" &&
      r.serviceDate < todayKey &&
      (r.paymentStatus === PAYMENT_STATUS.SCHEDULED ||
        r.paymentStatus === PAYMENT_STATUS.PROCESSING ||
        r.paymentStatus === PAYMENT_STATUS.REQUIRES_ACTION),
  );
  if (stuck) {
    const end = serviceEndOf(stuck);
    if (end && now.getTime() > end.getTime() + PAYMENT_NOT_CONFIRMED_GRACE_MS) {
      result.paymentNotConfirmed = true;
      await flagForReview(
        deps,
        schedule,
        {
          code: REVIEW_REASON.PAYMENT_NOT_CONFIRMED,
          headline: `Payment not confirmed for the ${stuck.serviceDate} cleaning`,
          detail: `Appointment ${stuck.bookingId} (#${stuck.occurrenceNumber}) was on ${stuck.serviceDate}, but its payment is still "${stuck.paymentStatus}", so the next recurring appointment has not been created. The next one is created automatically as soon as the payment succeeds. If the visit did not happen, mark it unperformed (before the charge) or end the schedule.`,
          occurrenceNumber: stuck.occurrenceNumber,
        },
        { now },
      );
    }
  }

  if (schedule.status !== SCHEDULE_STATUS.ACTIVE) {
    return { ...result, generation: { outcome: "skipped", reason: `schedule-${schedule.status.toLowerCase()}` } };
  }

  result.generation = await generateNextOccurrence(scheduleId, deps, now);
  return result;
}

// Completes a cancellation for an already-ended schedule's upcoming
// appointment, using the existing cancellation policy (free over 24h out,
// otherwise the existing late fee).
async function finishCancellation(deps: RecurringDeps, bookingId: string, now: Date): Promise<CancelBookingResult> {
  return cancelBookingById(bookingId, deps.bookings, deps.notifications, now);
}

// ---------------------------------------------------------------------------
// Stop recurring cleanings
// ---------------------------------------------------------------------------

export type StopRecurringOutcome =
  | { outcome: "invalid-token" }
  | { outcome: "not-recurring" }
  | { outcome: "stopped" | "already-ended"; scheduleId: string; cancelled: Array<{ bookingId: string; result: CancelBookingResult }> };

async function endScheduleAndCancelUpcoming(
  scheduleId: string,
  reason: string,
  deps: RecurringDeps,
  now: Date,
): Promise<Extract<StopRecurringOutcome, { scheduleId: string }>> {
  const schedule = await deps.schedules.getSchedule(scheduleId);
  if (!schedule) throw new Error("Recurring schedule not found.");
  const alreadyEnded = schedule.status === SCHEDULE_STATUS.ENDED;

  // Ending FIRST is what makes this race-safe against generation: a
  // generator that appended after this point re-reads the schedule status
  // and voids its own row; one that appended before is found and
  // cancelled by the sweep below.
  if (!alreadyEnded) {
    await deps.schedules.updateSchedule(scheduleId, {
      status: SCHEDULE_STATUS.ENDED,
      endedAt: formatOperationalTimestamp(now),
      endedReason: reason,
      reviewReason: "",
      reviewSince: "",
    });
    await deps.schedules.appendEvent({
      timestamp: formatOperationalTimestamp(now),
      scheduleId,
      occurrenceNumber: "",
      eventType: EVENT_TYPE.SCHEDULE_ENDED,
      detail: reason,
    });
  }

  const rows = await listRows(deps, scheduleId);
  const cancelled: Array<{ bookingId: string; result: CancelBookingResult }> = [];
  for (const row of canonicalRows(rows).filter(isUnbilledUpcoming)) {
    const result = await finishCancellation(deps, row.bookingId, now);
    cancelled.push({ bookingId: row.bookingId, result });
  }
  return { outcome: alreadyEnded ? "already-ended" : "stopped", scheduleId, cancelled };
}

/**
 * Customer "Stop recurring cleanings": ends the schedule (history and
 * payment records are untouched — only the Status changes) and cancels the
 * schedule's upcoming appointment under the EXISTING cancellation policy
 * (free more than 24h out; otherwise the existing late fee). Authority
 * comes from the customer's own Manage Booking token for any appointment of
 * the schedule. Idempotent.
 */
export async function stopRecurringByToken(
  token: string,
  deps: RecurringDeps,
  now: Date = new Date(),
): Promise<StopRecurringOutcome> {
  if (!isPlausibleManageToken(token)) return { outcome: "invalid-token" };
  const bookingId = await deps.bookings.findBookingIdByManageTokenHash(hashManageToken(token));
  if (!bookingId) return { outcome: "invalid-token" };
  const record = await deps.bookings.getFullBookingRecord(bookingId);
  if (!record) return { outcome: "invalid-token" };
  if (!record.recurringScheduleId || record.occurrenceNumber < 1) return { outcome: "not-recurring" };
  const schedule = await deps.schedules.getSchedule(record.recurringScheduleId);
  if (!schedule) return { outcome: "not-recurring" };
  return endScheduleAndCancelUpcoming(schedule.scheduleId, ENDED_REASON.CUSTOMER_STOPPED, deps, now);
}

// ---------------------------------------------------------------------------
// Owner actions
// ---------------------------------------------------------------------------

export type OwnerActionOutcome =
  | { outcome: "schedule-not-found" }
  | { outcome: "not-applicable"; message: string }
  | { outcome: "done"; generation?: GenerationOutcome; stop?: Extract<StopRecurringOutcome, { scheduleId: string }> };

/**
 * Skips the occurrence generation is currently blocked on (e.g. a blacked-out
 * week): the series continues from the NEXT regular occurrence. The anchor
 * never moves.
 */
export async function skipNextOccurrence(scheduleId: string, deps: RecurringDeps, now: Date = new Date()): Promise<OwnerActionOutcome> {
  const schedule = await deps.schedules.getSchedule(scheduleId);
  if (!schedule) return { outcome: "schedule-not-found" };
  if (schedule.status === SCHEDULE_STATUS.ENDED) return { outcome: "not-applicable", message: "The schedule has ended." };
  const rows = await listRows(deps, scheduleId);
  if ((await findOpenAppointments(deps, rows, schedule.timezone, now)).length > 0) {
    return { outcome: "not-applicable", message: "An appointment is already upcoming; there is nothing to skip." };
  }
  const skipped = Math.max(schedule.nextOccurrenceNumber, highestOccurrence(rows) + 1);
  await deps.schedules.updateSchedule(scheduleId, {
    nextOccurrenceNumber: skipped + 1,
    reviewReason: "",
    reviewSince: "",
  });
  await deps.schedules.appendEvent({
    timestamp: formatOperationalTimestamp(now),
    scheduleId,
    occurrenceNumber: skipped,
    eventType: EVENT_TYPE.OCCURRENCE_SKIPPED,
    detail: "Skipped by owner",
  });
  const generation = await generateNextOccurrence(scheduleId, deps, now);
  return { outcome: "done", generation };
}

/** Resumes a Paused schedule (after the owner has dealt with the payment failure) and generates through the same path. */
export async function resumeSchedule(scheduleId: string, deps: RecurringDeps, now: Date = new Date()): Promise<OwnerActionOutcome> {
  const schedule = await deps.schedules.getSchedule(scheduleId);
  if (!schedule) return { outcome: "schedule-not-found" };
  if (schedule.status !== SCHEDULE_STATUS.PAUSED) {
    return { outcome: "not-applicable", message: `The schedule is ${schedule.status}, not Paused.` };
  }
  // Acknowledge every Final Failure so it does not immediately re-pause.
  const rows = await listRows(deps, scheduleId);
  for (const row of canonicalRows(rows).filter((r) => r.paymentStatus === PAYMENT_STATUS.FINAL_FAILURE)) {
    await deps.schedules.claimOnce(`payfail-ack:${row.bookingId}`, scheduleId, "acknowledged by owner on resume", now);
  }
  await deps.schedules.updateSchedule(scheduleId, { status: SCHEDULE_STATUS.ACTIVE, reviewReason: "", reviewSince: "" });
  await deps.schedules.appendEvent({
    timestamp: formatOperationalTimestamp(now),
    scheduleId,
    occurrenceNumber: "",
    eventType: EVENT_TYPE.SCHEDULE_RESUMED,
    detail: "Resumed by owner",
  });
  const generation = await generateNextOccurrence(scheduleId, deps, now);
  return { outcome: "done", generation };
}

/** Owner ends a schedule; handled exactly like the customer's stop. */
export async function endScheduleByOwner(scheduleId: string, deps: RecurringDeps, now: Date = new Date()): Promise<OwnerActionOutcome> {
  const schedule = await deps.schedules.getSchedule(scheduleId);
  if (!schedule) return { outcome: "schedule-not-found" };
  const stop = await endScheduleAndCancelUpcoming(scheduleId, ENDED_REASON.OWNER_ENDED, deps, now);
  return { outcome: "done", stop };
}

// ---------------------------------------------------------------------------
// Owner-assisted conversion of an existing frequency-labelled booking
// ---------------------------------------------------------------------------

/** Marks a schedule that began as a pre-existing booking, converted by the owner after customer confirmation. */
export const CONVERTED_PRICING_POLICY = "converted-existing-v1";
export const CONVERSION_CONSENT_VERSION = "owner-confirmed-conversion-v1";

export type ConversionOutcome =
  | { outcome: "converted"; scheduleId: string; preservedTotal: number; recurringPriceTotal: number; generation?: GenerationOutcome }
  | {
      outcome: "refused";
      reason:
        | "booking-not-found"
        | "customer-confirmation-required"
        | "booking-cancelled"
        | "not-recurring-frequency"
        | "already-in-a-schedule"
        | "exact-start-time-required"
        | "repository-unsupported";
      message: string;
    };

/**
 * Converts ONE existing frequency-labelled booking into a recurring
 * schedule, only on the owner's explicit say-so after the customer has
 * confirmed (never automatic). The booking's own amounts, Stripe IDs,
 * payment history and status are untouched — only its two schedule-linkage
 * cells are written. The ongoing arrangement is the booking's own
 * components at the frequency's current discount, recorded on the schedule
 * (Recurring Price Total) and in the audit log together with the owner's
 * confirmation note.
 */
export async function convertExistingBookingToSchedule(
  bookingId: string,
  confirmation: { customerConfirmed: boolean; note: string },
  deps: RecurringDeps,
  now: Date = new Date(),
): Promise<ConversionOutcome> {
  const refuse = (reason: Extract<ConversionOutcome, { outcome: "refused" }>["reason"], message: string): ConversionOutcome => ({
    outcome: "refused",
    reason,
    message,
  });

  const note = confirmation.note.trim();
  if (confirmation.customerConfirmed !== true || note.length === 0) {
    return refuse(
      "customer-confirmation-required",
      "Convert only after the customer has confirmed. Pass customerConfirmed: true and a note saying how and when they confirmed.",
    );
  }
  if (!deps.bookings.linkBookingToRecurringSchedule) {
    return refuse("repository-unsupported", "The booking repository cannot link existing bookings to a schedule.");
  }

  const record = await deps.bookings.getFullBookingRecord(bookingId);
  if (!record) return refuse("booking-not-found", "No booking with that ID.");
  if (record.bookingStatus === BOOKING_STATUS.CANCELLED) return refuse("booking-cancelled", "A cancelled booking cannot start a schedule.");
  const frequencyId = getFrequencyIdForLabel(record.frequency);
  if (!frequencyId || frequencyId === "one-time") {
    return refuse("not-recurring-frequency", "Only a booking with a weekly, every-other-week or monthly frequency can be converted.");
  }
  if (record.occurrenceNumber > 0) return refuse("already-in-a-schedule", "This booking already belongs to a recurring schedule.");
  if (!record.serviceStartTime) {
    return refuse(
      "exact-start-time-required",
      "This booking uses a legacy arrival window. Reschedule it to an exact start time first so the schedule has a start time to repeat.",
    );
  }
  const existing = await deps.schedules.getSchedule(record.bookingId);
  if (existing) return refuse("already-in-a-schedule", "A schedule already exists for this booking.");

  const settings = await getBookingSettings();
  const schedule = buildScheduleFromInitialBooking(record, true, settings.timezone);
  schedule.pricingPolicy = CONVERTED_PRICING_POLICY;
  schedule.consentVersion = CONVERSION_CONSENT_VERSION;
  schedule.consentAt = formatOperationalTimestamp(now);
  // A converted booking may already have a stored discount under the old
  // policy; the schedule's full-price figure is its undiscounted subtotal.
  schedule.fullPriceTotal = record.subtotal;

  const { created } = await deps.schedules.createSchedule(schedule);
  if (!created) return refuse("already-in-a-schedule", "A schedule already exists for this booking.");
  await deps.bookings.linkBookingToRecurringSchedule(record.bookingId, schedule.scheduleId, 1);
  await deps.schedules.appendEvent({
    timestamp: formatOperationalTimestamp(now),
    scheduleId: schedule.scheduleId,
    occurrenceNumber: 1,
    eventType: EVENT_TYPE.SCHEDULE_CONVERTED,
    detail: `Converted from existing booking ${record.bookingId} (${record.frequency}). Booked amount preserved at $${record.totalPrice}; ongoing per-appointment total $${schedule.recurringPriceTotal}. Customer confirmation: ${note}`.slice(0, 500),
  });

  // Converted schedules follow the same rule as new ones: if that booking has
  // already been paid for and its date has passed, the next appointment is
  // due now — through the one creation path (which waits otherwise).
  const generation: GenerationOutcome | undefined = await generateNextOccurrence(schedule.scheduleId, deps, now);
  return {
    outcome: "converted",
    scheduleId: schedule.scheduleId,
    preservedTotal: record.totalPrice,
    recurringPriceTotal: schedule.recurringPriceTotal,
    generation,
  };
}

// ---------------------------------------------------------------------------
// Manage Booking context (what the customer sees before confirming)
// ---------------------------------------------------------------------------

export type RecurringManageContext = {
  frequency: string;
  scheduleStatus: string;
  /** The appointment "Stop recurring cleanings" would cancel, with the fee that would apply. */
  upcoming: null | {
    bookingId: string;
    serviceDate: string;
    scheduleDisplayLabel: string;
    totalPrice: number;
    isThisAppointment: boolean;
    isLateWindow: boolean;
    lateCancellationFeeCents: number | null;
  };
  /** The regular date the series continues on if THIS appointment alone is cancelled. */
  nextRegularDate: string | null;
  canStop: boolean;
};

export async function buildRecurringManageContext(
  record: BookingRecord,
  deps: Pick<RecurringDeps, "bookings" | "schedules">,
  now: Date = new Date(),
): Promise<RecurringManageContext | null> {
  if (!record.recurringScheduleId || record.occurrenceNumber < 1) return null;
  const schedule = await deps.schedules.getSchedule(record.recurringScheduleId);
  if (!schedule) return null;

  const active = schedule.status === SCHEDULE_STATUS.ACTIVE || schedule.status === SCHEDULE_STATUS.PAUSED;
  let upcoming: RecurringManageContext["upcoming"] = null;
  if (active && deps.bookings.listScheduleBookings) {
    const rows = canonicalRows(await deps.bookings.listScheduleBookings(schedule.scheduleId));
    const target = rows
      .filter(isUnbilledUpcoming)
      .sort((a, b) => a.occurrenceNumber - b.occurrenceNumber)[0];
    if (target) {
      const full = target.bookingId === record.bookingId ? record : await deps.bookings.getFullBookingRecord(target.bookingId);
      if (full) {
        const settings = await getBookingSettings();
        const timing = getBookingTimingStatus(full.serviceDate, full.serviceStartTime, full.arrivalWindow, settings.timezone, now);
        upcoming = {
          bookingId: full.bookingId,
          serviceDate: full.serviceDate,
          scheduleDisplayLabel: getScheduleDisplayLabel(full),
          totalPrice: full.chargeAmount,
          isThisAppointment: full.bookingId === record.bookingId,
          isLateWindow: !timing.isMoreThan24HoursOut,
          lateCancellationFeeCents: timing.isMoreThan24HoursOut ? null : calculateLateCancellationFeeCents(full.chargeAmount),
        };
      }
    }
  }

  const frequencyId = getFrequencyIdForLabel(schedule.frequency);
  let nextRegularDate: string | null = null;
  if (active && frequencyId && frequencyId !== "one-time") {
    nextRegularDate = getOccurrenceDateKey(schedule.anchorDate, frequencyId, record.occurrenceNumber + 1);
  }

  return {
    frequency: schedule.frequency,
    scheduleStatus: schedule.status,
    upcoming,
    nextRegularDate,
    canStop: active,
  };
}


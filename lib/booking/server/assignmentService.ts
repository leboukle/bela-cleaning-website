// SERVER-ONLY. Orchestrates the Milestone 7 cleaner-assignment lifecycle:
// creation (BeLa-initiated only — see docs/cleaner-assignment.md), the
// cleaner's Accept/Decline response, and expiry. Mirrors
// paymentProcessingService.ts / cancellationService.ts's role: routes and
// UI are thin plumbing, this module is where the actual sequencing and
// business rules live so it can be unit-tested without a real HTTP
// request.
//
// Deliberately depends on BOTH repositories: CleanerAssignmentRepository
// for assignment/cleaner state, and BookingRepository (read-only, plus
// the one new markBookingCompleted write) for the job details the emails
// need. This is the one module in this milestone that touches booking
// data, and only ever reads it (except markBookingComplete, an explicit,
// additive, human-triggered write to a previously-dormant column).
import "server-only";
import { BOOKING_STATUS } from "./bookingsSheetSchema";
import { ASSIGNMENT_STATUS, CLEANER_STATUS } from "./cleanerSheetSchema";
import { generateAssignmentId } from "./cleanerId";
import { generateManageToken, hashManageToken, isPlausibleManageToken } from "./manageToken";
import { computeAssignmentResponseDeadline } from "./assignmentDeadline";
import { calculatePayoutAmount, STANDARD_CLEANER_PAYOUT_PERCENTAGE } from "@/lib/booking/cleanerPayout";
import { resolveRecordStartSpec, calculateServiceStart } from "./serviceTime";
import { getBookingSettings } from "./settings";
import { formatOperationalTimestamp } from "./dateUtils";
import type { BookingRepository } from "./repository";
import type { CleanerAssignmentRepository } from "./cleanerRepository";
import type { AssignmentRecord } from "./cleanerTypes";
import type { AssignableBookingSummary, BookingRecord } from "./types";
import type { CleanerAssignmentNotificationSender } from "./cleanerNotificationService";

export type CreateAssignmentOutcome =
  | { outcome: "booking-not-found" }
  | { outcome: "booking-cancelled" }
  | { outcome: "cleaner-not-found" }
  | { outcome: "cleaner-inactive" }
  | { outcome: "already-assigned"; existingStatus: string }
  | { outcome: "too-close-to-service-start"; hoursUntilServiceStart: number }
  | { outcome: "created"; assignmentId: string; responseDeadline: string; payoutAmount: number }
  // The assignment row was created (Pending, token hash written) exactly
  // as in "created" — never rolled back — but the offer email itself did
  // not send. Distinct from "created" so the internal UI can flag that
  // BeLa needs to follow up with the cleaner directly.
  | { outcome: "created-email-failed"; assignmentId: string; responseDeadline: string; payoutAmount: number };

export type RespondOutcome =
  | { outcome: "invalid-token" }
  | { outcome: "already-resolved"; status: string; assignment: AssignmentRecord }
  | { outcome: "expired"; assignment: AssignmentRecord }
  | { outcome: "accepted"; assignment: AssignmentRecord }
  | { outcome: "declined"; assignment: AssignmentRecord };

export type ExpireOutcome =
  | { outcome: "not-found" }
  | { outcome: "not-pending"; status: string }
  | { outcome: "not-yet-due" }
  | { outcome: "expired" };

function logError(step: string, id: string, error: unknown): void {
  console.error(`[assignmentService] ${step} failed: id=${id}`, error instanceof Error ? error.message : "unknown error");
}

/** Resolves a booking's real-world service start, DST-safe — the canonical resolver (see serviceTime.ts). */
async function resolveServiceStart(record: BookingRecord): Promise<Date> {
  const settings = await getBookingSettings();
  const spec = resolveRecordStartSpec(record);
  return calculateServiceStart(record.serviceDate, spec, settings.timezone);
}

/**
 * Bookings the internal assignment page should offer BeLa as candidates
 * for a NEW assignment — i.e. not cancelled, upcoming, AND not already
 * carrying a Pending/Accepted assignment (mirrors the same check
 * createAssignment itself re-validates server-side; this is only for
 * populating the picker, never trusted as authorization on its own).
 * Deliberately lives here, not in the page component — "which bookings
 * are eligible" is domain logic, not presentation.
 */
export async function listAssignableBookings(
  bookingRepository: BookingRepository,
  assignmentRepository: CleanerAssignmentRepository,
  todayDateKey: string,
): Promise<AssignableBookingSummary[]> {
  const candidates = await bookingRepository.listAssignableBookings(todayDateKey);
  const results = await Promise.all(
    candidates.map(async (booking) => {
      const existing = await assignmentRepository.getLatestAssignmentForBooking(booking.bookingId);
      const alreadyAssigned = existing && (existing.status === ASSIGNMENT_STATUS.PENDING || existing.status === ASSIGNMENT_STATUS.ACCEPTED);
      return alreadyAssigned ? null : booking;
    }),
  );
  return results.filter((booking): booking is AssignableBookingSummary => booking !== null);
}

/**
 * BeLa-initiated only (see architecture report §3/§9) — nothing in this
 * codebase ever calls this automatically or chooses a cleaner itself.
 */
export async function createAssignment(
  bookingId: string,
  cleanerId: string,
  bookingRepository: BookingRepository,
  assignmentRepository: CleanerAssignmentRepository,
  notifications: CleanerAssignmentNotificationSender,
  now: Date = new Date(),
): Promise<CreateAssignmentOutcome> {
  const record = await bookingRepository.getFullBookingRecord(bookingId);
  if (!record) return { outcome: "booking-not-found" };
  if (record.bookingStatus === BOOKING_STATUS.CANCELLED) return { outcome: "booking-cancelled" };

  const cleaner = await assignmentRepository.getCleanerById(cleanerId);
  if (!cleaner) return { outcome: "cleaner-not-found" };
  if (cleaner.status !== CLEANER_STATUS.ACTIVE) return { outcome: "cleaner-inactive" };

  const existing = await assignmentRepository.getLatestAssignmentForBooking(bookingId);
  if (existing && (existing.status === ASSIGNMENT_STATUS.PENDING || existing.status === ASSIGNMENT_STATUS.ACCEPTED)) {
    return { outcome: "already-assigned", existingStatus: existing.status };
  }

  const serviceStartAt = await resolveServiceStart(record);
  const deadlineResult = computeAssignmentResponseDeadline(now, serviceStartAt);
  if (!deadlineResult.ok) {
    return { outcome: "too-close-to-service-start", hoursUntilServiceStart: deadlineResult.hoursUntilServiceStart };
  }

  const assignmentId = generateAssignmentId();
  const token = generateManageToken();
  const tokenHash = hashManageToken(token);
  const payoutAmount = calculatePayoutAmount(record.chargeAmount);
  const cleanerName = `${cleaner.firstName} ${cleaner.lastName}`.trim();

  await assignmentRepository.createAssignment({
    assignmentId,
    bookingId,
    cleanerId,
    cleanerName,
    status: ASSIGNMENT_STATUS.PENDING,
    offeredAt: formatOperationalTimestamp(now),
    responseDeadline: deadlineResult.responseDeadline.toISOString(),
    cleaningTotalSnapshot: record.chargeAmount,
    payoutPercentageSnapshot: STANDARD_CLEANER_PAYOUT_PERCENTAGE,
    payoutAmountSnapshot: payoutAmount,
    assignmentTokenHash: tokenHash,
  });

  // The assignment row above is never rolled back based on what happens
  // here — history (who was offered what, and when) must be preserved
  // regardless of whether the notification email itself succeeds. This
  // inspects BOTH failure paths: a thrown exception (network/transport
  // error) and a normal, non-throwing `{ ok: false }` result (the shape
  // every notification-sender method in this codebase actually uses for
  // a provider-level send failure — see CleanerNotificationResult) —
  // the latter was previously never checked here, which meant a genuine
  // send failure was silently reported as success.
  let emailSent = false;
  try {
    const sendResult = await notifications.sendCleanerAssignmentOffer(record, cleaner, {
      assignmentId,
      payoutAmount,
      payoutPercentage: STANDARD_CLEANER_PAYOUT_PERCENTAGE,
      token,
    });
    if (sendResult.ok) {
      emailSent = true;
    } else {
      // Never log the cleaner's email address or name here — only the
      // assignment/booking IDs and the transport's own error string
      // (which describes the failure, e.g. a provider error code, not
      // any PII).
      logError("sendCleanerAssignmentOffer", assignmentId, new Error(sendResult.error));
    }
  } catch (error) {
    logError("sendCleanerAssignmentOffer", assignmentId, error);
  }

  if (!emailSent) {
    return { outcome: "created-email-failed", assignmentId, responseDeadline: deadlineResult.responseDeadline.toISOString(), payoutAmount };
  }
  return { outcome: "created", assignmentId, responseDeadline: deadlineResult.responseDeadline.toISOString(), payoutAmount };
}

/**
 * Shared by acceptAssignment/declineAssignment: resolves a token to its
 * assignment row, self-healing to Expired on read if the deadline has
 * already passed but no scheduler run has caught it yet — mirrors
 * paymentProcessingService.ts's idempotency guard, which self-heals stale
 * cached state the moment it's independently discovered to be wrong,
 * rather than waiting for the next scheduled pass.
 */
async function resolveRespondableAssignment(
  token: string,
  assignmentRepository: CleanerAssignmentRepository,
  notifications: CleanerAssignmentNotificationSender,
  bookingRepository: BookingRepository,
  now: Date,
): Promise<{ ok: false; result: RespondOutcome } | { ok: true; assignment: AssignmentRecord }> {
  if (!isPlausibleManageToken(token)) return { ok: false, result: { outcome: "invalid-token" } };

  const assignment = await assignmentRepository.findAssignmentByTokenHash(hashManageToken(token));
  if (!assignment) return { ok: false, result: { outcome: "invalid-token" } };

  if (assignment.status !== ASSIGNMENT_STATUS.PENDING) {
    return { ok: false, result: { outcome: "already-resolved", status: assignment.status, assignment } };
  }

  if (now.getTime() >= new Date(assignment.responseDeadline).getTime()) {
    const expired = await expireAssignmentRow(assignment, assignmentRepository, bookingRepository, notifications, now);
    return { ok: false, result: { outcome: "expired", assignment: expired } };
  }

  return { ok: true, assignment };
}

async function expireAssignmentRow(
  assignment: AssignmentRecord,
  assignmentRepository: CleanerAssignmentRepository,
  bookingRepository: BookingRepository,
  notifications: CleanerAssignmentNotificationSender,
  now: Date,
): Promise<AssignmentRecord> {
  try {
    await assignmentRepository.updateAssignmentResolution(assignment.assignmentId, {
      status: ASSIGNMENT_STATUS.EXPIRED,
      acceptedAt: "",
      declinedAt: "",
      expiredAt: formatOperationalTimestamp(now),
    });
  } catch (error) {
    logError("updateAssignmentResolution (expire)", assignment.assignmentId, error);
  }
  try {
    const record = await bookingRepository.getFullBookingRecord(assignment.bookingId);
    if (record) await notifications.sendInternalAssignmentExpired(record, assignment);
  } catch (error) {
    logError("sendInternalAssignmentExpired", assignment.assignmentId, error);
  }
  return { ...assignment, status: ASSIGNMENT_STATUS.EXPIRED, expiredAt: formatOperationalTimestamp(now) };
}

export async function acceptAssignment(
  token: string,
  bookingRepository: BookingRepository,
  assignmentRepository: CleanerAssignmentRepository,
  notifications: CleanerAssignmentNotificationSender,
  now: Date = new Date(),
): Promise<RespondOutcome> {
  const resolved = await resolveRespondableAssignment(token, assignmentRepository, notifications, bookingRepository, now);
  if (!resolved.ok) return resolved.result;

  const { assignment } = resolved;
  try {
    await assignmentRepository.updateAssignmentResolution(assignment.assignmentId, {
      status: ASSIGNMENT_STATUS.ACCEPTED,
      acceptedAt: formatOperationalTimestamp(now),
      declinedAt: "",
      expiredAt: "",
    });
  } catch (error) {
    logError("updateAssignmentResolution (accept)", assignment.assignmentId, error);
    throw error;
  }

  const updated: AssignmentRecord = { ...assignment, status: ASSIGNMENT_STATUS.ACCEPTED, acceptedAt: formatOperationalTimestamp(now) };

  try {
    const record = await bookingRepository.getFullBookingRecord(assignment.bookingId);
    if (record) await notifications.sendInternalAssignmentAccepted(record, updated);
  } catch (error) {
    logError("sendInternalAssignmentAccepted", assignment.assignmentId, error);
  }

  return { outcome: "accepted", assignment: updated };
}

export async function declineAssignment(
  token: string,
  bookingRepository: BookingRepository,
  assignmentRepository: CleanerAssignmentRepository,
  notifications: CleanerAssignmentNotificationSender,
  now: Date = new Date(),
): Promise<RespondOutcome> {
  const resolved = await resolveRespondableAssignment(token, assignmentRepository, notifications, bookingRepository, now);
  if (!resolved.ok) return resolved.result;

  const { assignment } = resolved;
  try {
    await assignmentRepository.updateAssignmentResolution(assignment.assignmentId, {
      status: ASSIGNMENT_STATUS.DECLINED,
      acceptedAt: "",
      declinedAt: formatOperationalTimestamp(now),
      expiredAt: "",
    });
  } catch (error) {
    logError("updateAssignmentResolution (decline)", assignment.assignmentId, error);
    throw error;
  }

  const updated: AssignmentRecord = { ...assignment, status: ASSIGNMENT_STATUS.DECLINED, declinedAt: formatOperationalTimestamp(now) };

  try {
    const record = await bookingRepository.getFullBookingRecord(assignment.bookingId);
    if (record) await notifications.sendInternalAssignmentDeclined(record, updated);
  } catch (error) {
    logError("sendInternalAssignmentDeclined", assignment.assignmentId, error);
  }

  return { outcome: "declined", assignment: updated };
}

/** Called by the expiry scheduler route for one candidate Assignment ID — always re-validates, never trusts the caller's due-ness claim. */
export async function processExpireDueAssignment(
  assignmentId: string,
  bookingRepository: BookingRepository,
  assignmentRepository: CleanerAssignmentRepository,
  notifications: CleanerAssignmentNotificationSender,
  now: Date = new Date(),
): Promise<ExpireOutcome> {
  const assignment = await assignmentRepository.getAssignmentById(assignmentId);
  if (!assignment) return { outcome: "not-found" };
  if (assignment.status !== ASSIGNMENT_STATUS.PENDING) return { outcome: "not-pending", status: assignment.status };
  if (now.getTime() < new Date(assignment.responseDeadline).getTime()) return { outcome: "not-yet-due" };

  await expireAssignmentRow(assignment, assignmentRepository, bookingRepository, notifications, now);
  return { outcome: "expired" };
}

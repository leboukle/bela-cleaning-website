// SERVER-ONLY. The one place that resolves a cleaner-assignment token
// into a cleaner-safe view — shared by the page's server-side render and
// the accept/decline routes' pre-render, so there is exactly one
// token-resolution path. Mirrors manageBookingAccess.ts's role exactly.
import "server-only";
import { hashManageToken, isPlausibleManageToken } from "./manageToken";
import { buildCleanerAssignmentView, type CleanerAssignmentView } from "./cleanerAssignmentView";
import type { BookingRepository } from "./repository";
import type { CleanerAssignmentRepository } from "./cleanerRepository";

export type CleanerAssignmentAccessResult = { ok: true; view: CleanerAssignmentView } | { ok: false };

export async function getCleanerAssignmentView(
  token: string,
  bookingRepository: BookingRepository,
  assignmentRepository: CleanerAssignmentRepository,
  now: Date = new Date(),
): Promise<CleanerAssignmentAccessResult> {
  if (!isPlausibleManageToken(token)) return { ok: false };

  const assignment = await assignmentRepository.findAssignmentByTokenHash(hashManageToken(token));
  if (!assignment) return { ok: false };

  const record = await bookingRepository.getFullBookingRecord(assignment.bookingId);
  if (!record) return { ok: false };

  return { ok: true, view: buildCleanerAssignmentView(record, assignment, now) };
}

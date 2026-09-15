// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Internal, staff-only notification: an assignment's 24/12-hour response
// window elapsed with no cleaner response.
import "server-only";
import { formatReadableDate, getScheduleDisplayLabel } from "@/lib/booking/schedule";
import type { AssignmentRecord } from "../../cleanerTypes";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildInternalAssignmentExpiredEmail(record: BookingRecord, assignment: AssignmentRecord): Omit<EmailMessage, "to"> {
  const subject = `Assignment Expired — ${record.bookingId} — ${assignment.cleanerName}`;
  const scheduleLabel = getScheduleDisplayLabel(record);
  const dateLabel = formatReadableDate(record.serviceDate);

  const text = [
    `The assignment offer to ${assignment.cleanerName} for cleaning ${record.bookingId} (${dateLabel} at ${scheduleLabel}) expired with no response.`,
    "",
    `Booking ID: ${record.bookingId}`,
    `Cleaner: ${assignment.cleanerName} (${assignment.cleanerId})`,
    `Offered at: ${assignment.offeredAt}`,
    `Expired at: ${assignment.expiredAt}`,
    `Service date: ${dateLabel}`,
    `Start time: ${scheduleLabel}`,
    "",
    "This booking needs a new cleaner assignment.",
  ].join("\n");

  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#3B2F27;">
  <h1 style="font-size:20px;margin:0 0 16px;">Assignment Expired</h1>
  <p>The assignment offer to <strong>${escapeHtml(assignment.cleanerName)}</strong> for cleaning <strong>${escapeHtml(record.bookingId)}</strong> (${escapeHtml(dateLabel)} at ${escapeHtml(scheduleLabel)}) expired with no response.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <tr><td style="padding:4px 0;color:#8A7A6B;">Booking ID</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.bookingId)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Cleaner</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(assignment.cleanerName)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Offered at</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(assignment.offeredAt)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Expired at</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(assignment.expiredAt)}</td></tr>
  </table>
  <p style="font-size:14px;font-weight:600;">This booking needs a new cleaner assignment.</p>
</div>`.trim();

  return { subject, text, html };
}

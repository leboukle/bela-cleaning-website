// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Internal, staff-only notification: a cleaner declined an assignment.
import "server-only";
import { formatReadableDate, getScheduleDisplayLabel } from "@/lib/booking/schedule";
import type { AssignmentRecord } from "../../cleanerTypes";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildInternalAssignmentDeclinedEmail(record: BookingRecord, assignment: AssignmentRecord): Omit<EmailMessage, "to"> {
  const subject = `Assignment Declined — ${record.bookingId} — ${assignment.cleanerName}`;
  const scheduleLabel = getScheduleDisplayLabel(record);
  const dateLabel = formatReadableDate(record.serviceDate);

  const text = [
    `${assignment.cleanerName} declined cleaning assignment ${record.bookingId} for ${dateLabel} at ${scheduleLabel}.`,
    "",
    `Booking ID: ${record.bookingId}`,
    `Cleaner: ${assignment.cleanerName} (${assignment.cleanerId})`,
    `Declined at: ${assignment.declinedAt}`,
    `Service date: ${dateLabel}`,
    `Start time: ${scheduleLabel}`,
    "",
    "This booking needs a new cleaner assignment.",
  ].join("\n");

  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#3B2F27;">
  <h1 style="font-size:20px;margin:0 0 16px;">Assignment Declined</h1>
  <p><strong>${escapeHtml(assignment.cleanerName)}</strong> declined cleaning assignment <strong>${escapeHtml(record.bookingId)}</strong> for ${escapeHtml(dateLabel)} at ${escapeHtml(scheduleLabel)}.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <tr><td style="padding:4px 0;color:#8A7A6B;">Booking ID</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.bookingId)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Cleaner</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(assignment.cleanerName)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Declined at</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(assignment.declinedAt)}</td></tr>
  </table>
  <p style="font-size:14px;font-weight:600;">This booking needs a new cleaner assignment.</p>
</div>`.trim();

  return { subject, text, html };
}

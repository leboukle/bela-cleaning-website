// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Sent to an Accepted cleaner approximately 72 hours before the exact
// appointment start time (see cleanerReminderService.ts) — completely
// separate from the customer's own 72-hour reminder (appointmentReminder.ts).
// No Accept/Decline controls: an accepted assignment is locked (see
// architecture report §8) — if the cleaner's availability has changed,
// they must contact BeLa directly. Same PII allow-list discipline as
// cleanerAssignmentOffer.ts — never record.email, record.mobile, or any
// Stripe/payment field.
import "server-only";
import { businessConfig } from "@/lib/config";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import { formatReadableDate, getScheduleDisplayLabel } from "@/lib/booking/schedule";
import { describeExtras } from "../../extrasDescription";
import type { AssignmentRecord } from "../../cleanerTypes";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildCleanerAppointmentReminderEmail(record: BookingRecord, cleanerFirstName: string, assignment: AssignmentRecord): Omit<EmailMessage, "to"> {
  const subject = `BeLa Cleaning — Reminder: upcoming assignment (${record.bookingId})`;
  const address = [record.streetAddress, record.apartmentOrUnit, `${record.city}, ${record.state} ${record.zipCode}`]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");
  const extras = describeExtras(record.extras);
  const payoutPercentLabel = `${Math.round(assignment.payoutPercentageSnapshot * 100)}%`;

  const lines: string[] = [
    `Hi ${cleanerFirstName},`,
    "",
    "This is a reminder about your upcoming BeLa Cleaning assignment.",
    "",
    `Booking ID: ${record.bookingId}`,
    `Customer: ${record.firstName}`,
    `Service address: ${address}`,
    `Service date: ${formatReadableDate(record.serviceDate)}`,
    `Start time: ${getScheduleDisplayLabel(record)}`,
    `Estimated duration: ${formatDuration(record.estimatedDurationMinutes)}`,
    `Cleaning type: ${record.cleaningType}`,
    `Bedrooms: ${record.bedrooms}`,
    `Bathrooms: ${record.bathrooms}`,
  ];
  if (extras.length > 0) lines.push(`Selected add-ons: ${extras.join(", ")}`);
  lines.push(`Access: ${record.someoneHome}`);
  if (record.specialInstructions) lines.push(`Customer notes (access/parking/pets/other): ${record.specialInstructions}`);

  lines.push(
    "",
    `Cleaning total: ${formatCurrency(record.chargeAmount)}`,
    `Your payout (${payoutPercentLabel}): ${formatCurrency(assignment.payoutAmountSnapshot)}`,
    "",
    "If anything has changed that may affect your ability to complete this assignment, please contact BeLa Cleaning immediately.",
    `${businessConfig.email}  •  ${businessConfig.phoneDisplay}`,
    "",
    "— The BeLa Cleaning Team",
  );

  const text = lines.join("\n");

  const extrasRow =
    extras.length > 0
      ? `<tr><td style="padding:4px 0;color:#8A7A6B;">Selected add-ons</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(extras.join(", "))}</td></tr>`
      : "";
  const notesRow = record.specialInstructions
    ? `<p style="font-size:14px;color:#6B5B4C;"><strong>Customer notes (access/parking/pets/other):</strong> ${escapeHtml(record.specialInstructions)}</p>`
    : "";

  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#3B2F27;">
  <h1 style="font-size:22px;margin:0 0 16px;">Upcoming assignment reminder</h1>
  <p>Hi ${escapeHtml(cleanerFirstName)},</p>
  <p>This is a reminder about your upcoming BeLa Cleaning assignment.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <tr><td style="padding:4px 0;color:#8A7A6B;">Booking ID</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.bookingId)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Customer</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.firstName)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service address</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(address)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service date</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatReadableDate(record.serviceDate))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Start time</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(getScheduleDisplayLabel(record))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Estimated duration</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatDuration(record.estimatedDurationMinutes))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Cleaning type</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.cleaningType)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Bedrooms / Bathrooms</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.bedrooms)} / ${escapeHtml(record.bathrooms)}</td></tr>
    ${extrasRow}
    <tr><td style="padding:4px 0;color:#8A7A6B;">Access</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.someoneHome)}</td></tr>
  </table>
  ${notesRow}
  <p style="font-size:15px;font-weight:600;margin:16px 0 4px;">Cleaning total: ${escapeHtml(formatCurrency(record.chargeAmount))}</p>
  <p style="font-size:15px;font-weight:600;margin:0 0 16px;color:#1E5B3A;">Your payout (${escapeHtml(payoutPercentLabel)}): ${escapeHtml(formatCurrency(assignment.payoutAmountSnapshot))}</p>
  <p style="font-size:13px;color:#6B5B4C;">
    If anything has changed that may affect your ability to complete this assignment, please contact BeLa Cleaning immediately.<br/>
    ${escapeHtml(businessConfig.email)} &bull; ${escapeHtml(businessConfig.phoneDisplay)}
  </p>
  <p style="font-size:14px;">— The BeLa Cleaning Team</p>
</div>`.trim();

  return { subject, text, html };
}

// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Builds the initial cleaner-assignment offer email. Deliberately reads
// only an explicit allow-list of BookingRecord fields — never
// record.email, record.mobile, or any Stripe/payment-processing field
// (see the architecture report's "never expose" list). Both ACCEPT and
// DECLINE controls link to the SAME safe, GET, non-mutating assignment
// page (/cleaner-assignment/[token]) — the actual decision happens via a
// real button/POST on that page, never on a bare GET link, so an email
// security scanner's link-prefetch can never itself accept or decline an
// assignment. See docs/cleaner-assignment.md.
import "server-only";
import { businessConfig } from "@/lib/config";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import { formatReadableDate, getScheduleDisplayLabel } from "@/lib/booking/schedule";
import { describeExtras } from "../../extrasDescription";
import { buildCleanerAssignmentUrl } from "../../cleanerAssignmentToken";
import type { CleanerRecord } from "../../cleanerTypes";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export type AssignmentOfferDetail = {
  assignmentId: string;
  payoutAmount: number;
  payoutPercentage: number;
  token: string;
};

export function buildCleanerAssignmentOfferEmail(record: BookingRecord, cleaner: CleanerRecord, offer: AssignmentOfferDetail): Omit<EmailMessage, "to"> {
  const subject = `BeLa Cleaning — New Assignment Available (${record.bookingId})`;
  const address = [record.streetAddress, record.apartmentOrUnit, `${record.city}, ${record.state} ${record.zipCode}`]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");
  const extras = describeExtras(record.extras);
  const assignmentUrl = buildCleanerAssignmentUrl(offer.token);
  const payoutPercentLabel = `${Math.round(offer.payoutPercentage * 100)}%`;

  const lines: string[] = [
    `Hi ${cleaner.firstName},`,
    "",
    "You have a new BeLa Cleaning assignment available.",
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
    `Property type: ${record.propertyType}`,
    `Square footage: ${record.squareFootage}`,
  ];
  if (extras.length > 0) lines.push(`Selected add-ons: ${extras.join(", ")}`);
  lines.push(`Access: ${record.someoneHome}`);
  if (record.specialInstructions) lines.push(`Customer notes (access/parking/pets/other): ${record.specialInstructions}`);

  lines.push(
    "",
    `Cleaning total: ${formatCurrency(record.chargeAmount)}`,
    `Your payout (${payoutPercentLabel}): ${formatCurrency(offer.payoutAmount)}`,
    "",
    "Review and respond to this assignment here:",
    assignmentUrl,
    "",
    "Please respond by the deadline shown on that page.",
    "",
    "If your availability changes after accepting this assignment, please contact BeLa Cleaning directly.",
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
  <h1 style="font-size:22px;margin:0 0 16px;">New assignment available</h1>
  <p>Hi ${escapeHtml(cleaner.firstName)},</p>
  <p>You have a new BeLa Cleaning assignment available.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <tr><td style="padding:4px 0;color:#8A7A6B;">Booking ID</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.bookingId)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Customer</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.firstName)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service address</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(address)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service date</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatReadableDate(record.serviceDate))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Start time</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(getScheduleDisplayLabel(record))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Estimated duration</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatDuration(record.estimatedDurationMinutes))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Cleaning type</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.cleaningType)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Bedrooms / Bathrooms</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.bedrooms)} / ${escapeHtml(record.bathrooms)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Property type</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.propertyType)} &bull; ${escapeHtml(record.squareFootage)}</td></tr>
    ${extrasRow}
    <tr><td style="padding:4px 0;color:#8A7A6B;">Access</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.someoneHome)}</td></tr>
  </table>
  ${notesRow}
  <p style="font-size:15px;font-weight:600;margin:16px 0 4px;">Cleaning total: ${escapeHtml(formatCurrency(record.chargeAmount))}</p>
  <p style="font-size:15px;font-weight:600;margin:0 0 16px;color:#1E5B3A;">Your payout (${escapeHtml(payoutPercentLabel)}): ${escapeHtml(formatCurrency(offer.payoutAmount))}</p>
  <p style="text-align:center;margin:24px 0;">
    <a href="${escapeHtml(assignmentUrl)}" style="display:inline-block;background:#1E5B3A;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:600;margin:0 8px 8px 0;">ACCEPT ASSIGNMENT</a>
    <a href="${escapeHtml(assignmentUrl)}" style="display:inline-block;background:#3B2F27;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:600;margin:0 0 8px;">DECLINE ASSIGNMENT</a>
  </p>
  <p style="font-size:13px;color:#6B5B4C;">Please respond by the deadline shown on that page.</p>
  <p style="font-size:13px;color:#6B5B4C;">
    If your availability changes after accepting this assignment, please contact BeLa Cleaning directly.<br/>
    ${escapeHtml(businessConfig.email)} &bull; ${escapeHtml(businessConfig.phoneDisplay)}
  </p>
  <p style="font-size:14px;">— The BeLa Cleaning Team</p>
</div>`.trim();

  return { subject, text, html };
}

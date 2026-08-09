// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Builds the customer-facing "booking received" email. Every value comes
// from the already-validated, already-persisted BookingRecord; nothing
// here re-reads customer input, and nothing here exposes Google Sheets,
// spreadsheet IDs, or any other infrastructure detail — only what the
// customer themselves already provided plus the server-computed price and
// duration.
import "server-only";
import { businessConfig } from "@/lib/config";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import { formatReadableDate } from "@/lib/booking/schedule";
import { describeExtras } from "../../extrasDescription";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildCustomerBookingReceivedEmail(record: BookingRecord): Omit<EmailMessage, "to"> {
  const subject = `BeLa Cleaning — Booking ${record.bookingId}`;
  const address = [record.streetAddress, record.apartmentOrUnit, `${record.city}, ${record.state} ${record.zipCode}`]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");
  const extras = describeExtras(record.extras);
  const isRecurring = record.frequency !== "One time";

  const lines: string[] = [
    `Hi ${record.firstName},`,
    "",
    "We've received your cleaning request. Here's a summary of what you booked:",
    "",
    `Booking ID: ${record.bookingId}`,
    `Cleaning type: ${record.cleaningType}`,
    `Service date: ${formatReadableDate(record.serviceDate)}`,
    `Arrival window: ${record.arrivalWindow}`,
    `Service address: ${address}`,
    `Estimated duration: ${formatDuration(record.estimatedDurationMinutes)}`,
    `Estimated total: ${formatCurrency(record.totalPrice)}`,
  ];
  if (isRecurring) lines.push(`Frequency: ${record.frequency}`);
  if (extras.length > 0) lines.push(`Extras: ${extras.join(", ")}`);

  lines.push(
    "",
    `Status: ${record.bookingStatus}. Payment has not yet been processed — no charge has been made and no card`,
    "information has been collected. We'll follow up with next-step payment and appointment communications",
    "before your visit. Please keep your Booking ID for reference.",
    "",
    "Plans change — reschedule or cancel free of charge up to 24 hours before your visit, per the BeLa Cleaning",
    "Service Policy.",
    "",
    "Questions? We're happy to help.",
    `${businessConfig.email}  •  ${businessConfig.phoneDisplay}`,
    `${businessConfig.customerServiceDays}, ${businessConfig.customerServiceTime}`,
    "",
    "— The BeLa Cleaning Team",
  );

  const text = lines.join("\n");

  const extrasRow =
    extras.length > 0
      ? `<tr><td style="padding:4px 0;color:#8A7A6B;">Extras</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(extras.join(", "))}</td></tr>`
      : "";
  const frequencyRow = isRecurring
    ? `<tr><td style="padding:4px 0;color:#8A7A6B;">Frequency</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.frequency)}</td></tr>`
    : "";

  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#3B2F27;">
  <h1 style="font-size:22px;margin:0 0 16px;">Booking request received</h1>
  <p>Hi ${escapeHtml(record.firstName)},</p>
  <p>We've received your cleaning request. Here's a summary of what you booked:</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <tr><td style="padding:4px 0;color:#8A7A6B;">Booking ID</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.bookingId)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Cleaning type</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.cleaningType)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service date</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatReadableDate(record.serviceDate))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Arrival window</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.arrivalWindow)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service address</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(address)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Estimated duration</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatDuration(record.estimatedDurationMinutes))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Estimated total</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(record.totalPrice))}</td></tr>
    ${frequencyRow}
    ${extrasRow}
  </table>
  <p style="font-size:14px;color:#6B5B4C;">
    Status: <strong>${escapeHtml(record.bookingStatus)}</strong>. Payment has not yet been processed — no charge has
    been made and no card information has been collected. We'll follow up with next-step payment and appointment
    communications before your visit. Please keep your Booking ID for reference.
  </p>
  <p style="font-size:14px;color:#6B5B4C;">
    Plans change — reschedule or cancel free of charge up to 24 hours before your visit, per the BeLa Cleaning
    Service Policy.
  </p>
  <p style="font-size:14px;">
    Questions? We're happy to help.<br/>
    ${escapeHtml(businessConfig.email)} &bull; ${escapeHtml(businessConfig.phoneDisplay)}<br/>
    ${escapeHtml(businessConfig.customerServiceDays)}, ${escapeHtml(businessConfig.customerServiceTime)}
  </p>
  <p style="font-size:14px;">— The BeLa Cleaning Team</p>
</div>`.trim();

  return { subject, text, html };
}

// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Sent to the customer after a free (>24h) self-service cancellation.
import "server-only";
import { businessConfig } from "@/lib/config";
import { formatReadableDate, getScheduleDisplayLabel } from "@/lib/booking/schedule";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildFreeCancellationConfirmationEmail(record: BookingRecord): Omit<EmailMessage, "to"> {
  const subject = `BeLa Cleaning — Booking ${record.bookingId} cancelled`;

  const text = [
    `Hi ${record.firstName},`,
    "",
    `Your booking ${record.bookingId}, scheduled for ${formatReadableDate(record.serviceDate)} (${getScheduleDisplayLabel(record)}), has been cancelled at your request.`,
    "",
    "This cancellation was made more than 24 hours before your scheduled cleaning, so no charge has been made to your saved payment method.",
    "",
    "We'd love to have you back — feel free to book again anytime.",
    "",
    "Questions? We're happy to help.",
    `${businessConfig.email}  •  ${businessConfig.phoneDisplay}`,
    "",
    "— The BeLa Cleaning Team",
  ].join("\n");

  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#3B2F27;">
  <h1 style="font-size:22px;margin:0 0 16px;">Booking cancelled</h1>
  <p>Hi ${escapeHtml(record.firstName)},</p>
  <p>
    Your booking <strong>${escapeHtml(record.bookingId)}</strong>, scheduled for
    ${escapeHtml(formatReadableDate(record.serviceDate))} (${escapeHtml(getScheduleDisplayLabel(record))}), has been cancelled
    at your request.
  </p>
  <p style="font-size:14px;color:#6B5B4C;">
    This cancellation was made more than 24 hours before your scheduled cleaning, so no charge has been made to
    your saved payment method.
  </p>
  <p style="font-size:14px;">We&rsquo;d love to have you back — feel free to book again anytime.</p>
  <p style="font-size:14px;">
    Questions? We're happy to help.<br/>
    ${escapeHtml(businessConfig.email)} &bull; ${escapeHtml(businessConfig.phoneDisplay)}
  </p>
  <p style="font-size:14px;">— The BeLa Cleaning Team</p>
</div>`.trim();

  return { subject, text, html };
}

// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Sent to the customer immediately after a late (<=24h) self-service
// cancellation — states what will happen (the fee will be charged),
// never claims the charge has already succeeded (that's decided
// asynchronously by the Stripe webhook, same "never promise before the
// webhook confirms" principle as the payment-receipt email). If the fee
// charge later fails, BeLa is notified internally and handles it
// manually — see docs/manage-booking.md; this email's wording is safe
// either way since it never asserts an outcome, only the amount that will
// be attempted.
import "server-only";
import { businessConfig } from "@/lib/config";
import { formatCurrency } from "@/lib/booking/calculate";
import { formatReadableDate, getScheduleDisplayLabel } from "@/lib/booking/schedule";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildLateCancellationConfirmationEmail(record: BookingRecord): Omit<EmailMessage, "to"> {
  const subject = `BeLa Cleaning — Booking ${record.bookingId} cancelled (late-cancellation fee applies)`;
  const feeAmount = formatCurrency(record.cancellationFeeAmount);

  const text = [
    `Hi ${record.firstName},`,
    "",
    `Your booking ${record.bookingId}, scheduled for ${formatReadableDate(record.serviceDate)} (${getScheduleDisplayLabel(record)}), has been cancelled at your request.`,
    "",
    `This cancellation was made within 24 hours of your scheduled start time, so a late-cancellation fee of`,
    `${feeAmount} — 50% of your booking total — will be charged to your saved payment method.`,
    "",
    "BeLa Cleaning may waive or reduce this fee at its discretion in exceptional circumstances — contact us if",
    "you'd like to discuss your situation.",
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
    This cancellation was made within 24 hours of your scheduled start time, so a late-cancellation fee of
    <strong>${escapeHtml(feeAmount)}</strong> — 50% of your booking total — will be charged to your saved payment
    method.
  </p>
  <p style="font-size:14px;color:#6B5B4C;">
    BeLa Cleaning may waive or reduce this fee at its discretion in exceptional circumstances — contact us if
    you&rsquo;d like to discuss your situation.
  </p>
  <p style="font-size:14px;">
    Questions? We're happy to help.<br/>
    ${escapeHtml(businessConfig.email)} &bull; ${escapeHtml(businessConfig.phoneDisplay)}
  </p>
  <p style="font-size:14px;">— The BeLa Cleaning Team</p>
</div>`.trim();

  return { subject, text, html };
}

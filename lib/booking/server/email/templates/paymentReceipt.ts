// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Sent to the customer only after the Stripe webhook confirms
// payment_intent.succeeded — never sent from the synchronous
// process-due response, since that could fire before the charge is truly
// final. Never includes card details (BeLa never has them) or any
// decline/failure information (that only ever goes to the internal
// failure email, never to the customer).
import "server-only";
import { formatCurrency } from "@/lib/booking/calculate";
import { formatReadableDate } from "@/lib/booking/schedule";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildPaymentReceiptEmail(record: BookingRecord): Omit<EmailMessage, "to"> {
  const subject = `BeLa Cleaning — Payment receipt for ${record.bookingId}`;

  const text = [
    `Hi ${record.firstName},`,
    "",
    `Your payment for booking ${record.bookingId} has been processed successfully.`,
    "",
    `Amount charged: ${formatCurrency(record.chargeAmount)}`,
    `Service date: ${formatReadableDate(record.serviceDate)}`,
    `Arrival window: ${record.arrivalWindow}`,
    "",
    "Thank you for choosing BeLa Cleaning.",
    "",
    "Questions about this charge? Just reply to this email.",
    "",
    "— The BeLa Cleaning Team",
  ].join("\n");

  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#3B2F27;">
  <h1 style="font-size:22px;margin:0 0 16px;">Payment receipt</h1>
  <p>Hi ${escapeHtml(record.firstName)},</p>
  <p>Your payment for booking <strong>${escapeHtml(record.bookingId)}</strong> has been processed successfully.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <tr><td style="padding:4px 0;color:#8A7A6B;">Amount charged</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(record.chargeAmount))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service date</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatReadableDate(record.serviceDate))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Arrival window</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.arrivalWindow)}</td></tr>
  </table>
  <p style="font-size:14px;">Thank you for choosing BeLa Cleaning.</p>
  <p style="font-size:14px;">Questions about this charge? Just reply to this email.</p>
  <p style="font-size:14px;">— The BeLa Cleaning Team</p>
</div>`.trim();

  return { subject, text, html };
}

// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Internal, operational notification sent to BeLa staff when the Stripe
// webhook confirms a scheduled charge succeeded. Recipient is always
// BELA_INTERNAL_NOTIFICATION_EMAIL (see notificationService.ts), never
// derived from the booking record.
import "server-only";
import { formatCurrency } from "@/lib/booking/calculate";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildInternalPaymentSucceededEmail(record: BookingRecord): Omit<EmailMessage, "to"> {
  const subject = `Payment succeeded — ${record.bookingId} — ${formatCurrency(record.chargeAmount)}`;

  const rows: Array<[string, string]> = [
    ["Booking ID", record.bookingId],
    ["Customer", `${record.firstName} ${record.lastName}`.trim()],
    ["Amount charged", formatCurrency(record.chargeAmount)],
    ["Stripe Payment Intent", record.stripePaymentIntentId],
    ["Paid at", record.paidAt],
    ["Attempt number", String(record.paymentAttemptCount)],
    ["Service date", record.serviceDate],
  ];

  const text = [`Payment succeeded — ${record.bookingId}`, "", ...rows.map(([label, value]) => `${label}: ${value}`)].join(
    "\n",
  );

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <h1 style="font-size:18px;">Payment succeeded — ${escapeHtml(record.bookingId)}</h1>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:3px 8px 3px 0;color:#555;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:3px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`,
      )
      .join("")}
  </table>
</div>`.trim();

  return { subject, text, html };
}

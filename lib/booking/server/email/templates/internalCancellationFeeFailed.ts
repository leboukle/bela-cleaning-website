// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Internal, operational notification sent to BeLa staff when a
// late-cancellation fee charge fails — the booking remains Cancelled
// regardless (see cancellationService.ts); this email is what tells BeLa
// the fee itself needs manual follow-up. Includes raw Stripe decline
// detail for staff visibility — never sent to the customer.
import "server-only";
import { formatCurrency } from "@/lib/booking/calculate";
import type { PaymentIntentFailureDetail } from "../../stripe/paymentIntent";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildInternalCancellationFeeFailedEmail(
  record: BookingRecord,
  failure: PaymentIntentFailureDetail,
): Omit<EmailMessage, "to"> {
  const subject = `Cancellation fee FAILED — ${record.bookingId}`;

  const rows: Array<[string, string]> = [
    ["Booking ID", record.bookingId],
    ["Customer", `${record.firstName} ${record.lastName}`.trim()],
    ["Fee amount (50%)", formatCurrency(record.cancellationFeeAmount)],
    ["Booking status", record.bookingStatus],
    ["Payment status", record.paymentStatus],
    ["Stripe error type", failure.type ?? "(none)"],
    ["Stripe error code", failure.code ?? "(none)"],
    ["Stripe decline code", failure.declineCode ?? "(none)"],
    ["Original service date", record.serviceDate],
  ];

  const text = [`Cancellation fee failed — ${record.bookingId}`, "", ...rows.map(([label, value]) => `${label}: ${value}`), "", "The booking remains Cancelled. No automatic retry will be attempted — please follow up manually."].join(
    "\n",
  );

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <h1 style="font-size:18px;color:#a02020;">Cancellation fee failed — ${escapeHtml(record.bookingId)}</h1>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:3px 8px 3px 0;color:#555;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:3px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`,
      )
      .join("")}
  </table>
  <p style="font-size:13px;color:#555;margin-top:12px;">
    The booking remains Cancelled. No automatic retry will be attempted — please follow up manually.
  </p>
</div>`.trim();

  return { subject, text, html };
}

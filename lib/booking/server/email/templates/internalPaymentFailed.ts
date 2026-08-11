// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Internal, operational notification sent to BeLa staff on EVERY failed
// payment attempt (per the approved retry policy — BeLa is notified every
// time, regardless of whether the failure is retryable). Includes the raw
// Stripe decline/error codes for staff visibility; this level of detail is
// never sent to the customer (see paymentReceipt.ts, which never mentions
// failures at all).
import "server-only";
import { formatCurrency } from "@/lib/booking/calculate";
import { PAYMENT_STATUS } from "../../bookingsSheetSchema";
import type { FailureClassification } from "../../stripe/paymentFailureClassification";
import type { PaymentIntentFailureDetail } from "../../stripe/paymentIntent";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export type PaymentFailureNotificationDetail = {
  classification: FailureClassification;
  failure: PaymentIntentFailureDetail;
};

/**
 * A "retryable" classification doesn't always mean a retry actually got
 * scheduled — the 4th failed attempt is still classified retryable, but
 * has exhausted the cadence and lands on Final Failure instead. Keying
 * purely off classification would wrongly tell staff a retry is coming
 * when none is, so this also checks the record's actual resulting status.
 */
function describeClassification(classification: FailureClassification, paymentStatus: string): string {
  if (classification === "retryable" && paymentStatus === PAYMENT_STATUS.FINAL_FAILURE) {
    return "Retryable decline — retry limit exhausted; no further automatic attempts will be made.";
  }
  if (classification === "retryable") {
    return "Retryable — an automatic retry has been scheduled per the standard retry cadence.";
  }
  if (classification === "non-retryable") {
    return "Non-retryable — this is a hard decline. No further automatic retries will be attempted.";
  }
  return "Requires customer action — the card needs additional authentication that cannot be completed automatically.";
}

export function buildInternalPaymentFailedEmail(
  record: BookingRecord,
  detail: PaymentFailureNotificationDetail,
): Omit<EmailMessage, "to"> {
  const subject = `Payment FAILED — ${record.bookingId} — ${record.paymentStatus}`;

  const rows: Array<[string, string]> = [
    ["Booking ID", record.bookingId],
    ["Customer", `${record.firstName} ${record.lastName}`.trim()],
    ["Amount due", formatCurrency(record.chargeAmount)],
    ["Attempt number", String(record.paymentAttemptCount)],
    ["Resulting status", record.paymentStatus],
    ["Classification", describeClassification(detail.classification, record.paymentStatus)],
    ["Stripe error type", detail.failure.type ?? "(none)"],
    ["Stripe error code", detail.failure.code ?? "(none)"],
    ["Stripe decline code", detail.failure.declineCode ?? "(none)"],
    ["Next attempt at", record.nextPaymentAttemptAt || "(none scheduled)"],
    ["Service date", record.serviceDate],
  ];

  const text = [`Payment failed — ${record.bookingId}`, "", ...rows.map(([label, value]) => `${label}: ${value}`)].join(
    "\n",
  );

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <h1 style="font-size:18px;color:#a02020;">Payment failed — ${escapeHtml(record.bookingId)}</h1>
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

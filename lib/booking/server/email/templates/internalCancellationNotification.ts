// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Internal, operational notification sent to BeLa staff whenever a
// customer self-cancels — one template covers both the free (>24h) and
// late (<=24h, fee-applicable) cases, since the structural content is the
// same and the difference is just a few rows.
import "server-only";
import { formatCurrency } from "@/lib/booking/calculate";
import { getScheduleDisplayLabel } from "@/lib/booking/schedule";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export type InternalCancellationDetail = {
  isLate: boolean;
};

export function buildInternalCancellationEmail(record: BookingRecord, detail: InternalCancellationDetail): Omit<EmailMessage, "to"> {
  const subject = detail.isLate
    ? `Late cancellation (fee applies) — ${record.bookingId}`
    : `Booking cancelled (no charge) — ${record.bookingId}`;

  const rows: Array<[string, string]> = [
    ["Booking ID", record.bookingId],
    ["Customer", `${record.firstName} ${record.lastName}`.trim()],
    ["Original service date", record.serviceDate],
    ["Appointment time", getScheduleDisplayLabel(record)],
    ["Cancelled at", record.cancelledAt],
    ["Cancellation type", detail.isLate ? "Late (within 24 hours)" : "Free (more than 24 hours out)"],
  ];
  if (detail.isLate) {
    rows.push(["Late-cancellation fee (50%)", formatCurrency(record.cancellationFeeAmount)]);
    rows.push(["Fee payment status", record.paymentStatus]);
  }

  const text = [`${detail.isLate ? "Late cancellation" : "Cancellation"} — ${record.bookingId}`, "", ...rows.map(([label, value]) => `${label}: ${value}`)].join(
    "\n",
  );

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <h1 style="font-size:18px;${detail.isLate ? "color:#9C6B23;" : ""}">${escapeHtml(detail.isLate ? "Late cancellation" : "Cancellation")} — ${escapeHtml(record.bookingId)}</h1>
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

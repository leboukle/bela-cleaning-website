// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Sent to the customer after a successful self-service reschedule.
import "server-only";
import { businessConfig } from "@/lib/config";
import { formatReadableDate, getScheduleDisplayLabel } from "@/lib/booking/schedule";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export type RescheduleChange = {
  oldServiceDate: string;
  oldArrivalWindow: string;
  oldServiceStartTime: string;
};

export function buildRescheduleConfirmationEmail(record: BookingRecord, change: RescheduleChange): Omit<EmailMessage, "to"> {
  const subject = `BeLa Cleaning — Booking ${record.bookingId} rescheduled`;
  const oldLabel = getScheduleDisplayLabel({ serviceStartTime: change.oldServiceStartTime, arrivalWindow: change.oldArrivalWindow });
  const newLabel = getScheduleDisplayLabel(record);

  const text = [
    `Hi ${record.firstName},`,
    "",
    `Your booking ${record.bookingId} has been rescheduled.`,
    "",
    `Previous appointment: ${formatReadableDate(change.oldServiceDate)} (${oldLabel})`,
    `New appointment: ${formatReadableDate(record.serviceDate)} (${newLabel})`,
    "",
    "No rescheduling fee applies. Your saved payment method and booking total are unchanged.",
    "",
    "Questions? We're happy to help.",
    `${businessConfig.email}  •  ${businessConfig.phoneDisplay}`,
    "",
    "— The BeLa Cleaning Team",
  ].join("\n");

  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#3B2F27;">
  <h1 style="font-size:22px;margin:0 0 16px;">Booking rescheduled</h1>
  <p>Hi ${escapeHtml(record.firstName)},</p>
  <p>Your booking <strong>${escapeHtml(record.bookingId)}</strong> has been rescheduled.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <tr><td style="padding:4px 0;color:#8A7A6B;">Previous appointment</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatReadableDate(change.oldServiceDate))} (${escapeHtml(oldLabel)})</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">New appointment</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatReadableDate(record.serviceDate))} (${escapeHtml(newLabel)})</td></tr>
  </table>
  <p style="font-size:14px;color:#6B5B4C;">
    No rescheduling fee applies. Your saved payment method and booking total are unchanged.
  </p>
  <p style="font-size:14px;">
    Questions? We're happy to help.<br/>
    ${escapeHtml(businessConfig.email)} &bull; ${escapeHtml(businessConfig.phoneDisplay)}
  </p>
  <p style="font-size:14px;">— The BeLa Cleaning Team</p>
</div>`.trim();

  return { subject, text, html };
}

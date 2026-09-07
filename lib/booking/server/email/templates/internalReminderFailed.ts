// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Internal, operational notification sent to BeLa staff after the 3rd and
// final failed attempt to send a customer's 72-hour appointment reminder
// — reminderService.ts does not retry past this point; staff need to
// follow up manually. See reminderService.ts's bounded-retry policy.
import "server-only";
import { getScheduleDisplayLabel } from "@/lib/booking/schedule";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildInternalReminderFailedEmail(record: BookingRecord, totalAttempts: number): Omit<EmailMessage, "to"> {
  const subject = `Appointment reminder FAILED — ${record.bookingId}`;

  const rows: Array<[string, string]> = [
    ["Booking ID", record.bookingId],
    ["Customer", `${record.firstName} ${record.lastName}`.trim()],
    ["Service date", record.serviceDate],
    ["Appointment time", getScheduleDisplayLabel(record)],
    ["Total send attempts", String(totalAttempts)],
  ];

  const text = [
    `Appointment reminder failed — ${record.bookingId}`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "No further automatic attempts will be made. Please send a manual reminder if appropriate.",
  ].join("\n");

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <h1 style="font-size:18px;color:#a02020;">Appointment reminder failed — ${escapeHtml(record.bookingId)}</h1>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:3px 8px 3px 0;color:#555;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:3px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`,
      )
      .join("")}
  </table>
  <p style="font-size:13px;color:#555;margin-top:12px;">
    No further automatic attempts will be made. Please send a manual reminder if appropriate.
  </p>
</div>`.trim();

  return { subject, text, html };
}

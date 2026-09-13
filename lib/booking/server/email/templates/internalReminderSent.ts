// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Internal, operational notification sent to BeLa staff confirming a
// customer's 72-hour appointment reminder was sent successfully.
import "server-only";
import { getScheduleDisplayLabel } from "@/lib/booking/schedule";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildInternalReminderSentEmail(record: BookingRecord): Omit<EmailMessage, "to"> {
  const subject = `Appointment reminder sent — ${record.bookingId}`;

  const rows: Array<[string, string]> = [
    ["Booking ID", record.bookingId],
    ["Customer", `${record.firstName} ${record.lastName}`.trim()],
    ["Service date", record.serviceDate],
    ["Appointment time", getScheduleDisplayLabel(record)],
    ["Reminder sent at", record.appointmentReminderSentAt],
  ];

  const text = [`Appointment reminder sent — ${record.bookingId}`, "", ...rows.map(([label, value]) => `${label}: ${value}`)].join("\n");

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <h1 style="font-size:18px;">Appointment reminder sent — ${escapeHtml(record.bookingId)}</h1>
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

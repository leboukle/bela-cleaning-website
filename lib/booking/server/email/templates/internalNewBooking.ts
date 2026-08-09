// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Builds the internal, operational new-booking notification for BeLa
// staff. Unlike the customer email, this one intentionally includes the
// complete booking record (it's what ops needs to actually manage the
// appointment) — but still never exposes Google Sheets, spreadsheet IDs,
// row numbers, or any other infrastructure detail. The recipient is never
// derived from this record — see notificationService.ts, which reads it
// from BELA_INTERNAL_NOTIFICATION_EMAIL, never from customer input.
import "server-only";
import { describeExtras } from "../../extrasDescription";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildInternalNewBookingEmail(record: BookingRecord): Omit<EmailMessage, "to"> {
  const subject = `New BeLa Booking — ${record.bookingId} — ${record.serviceDate}`;
  const address = [record.streetAddress, record.apartmentOrUnit, `${record.city}, ${record.state} ${record.zipCode}`]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");
  const extras = describeExtras(record.extras);
  const extrasText = extras.length > 0 ? extras.join(", ") : "None";

  const rows: Array<[string, string]> = [
    ["Booking ID", record.bookingId],
    ["Submitted at", record.submittedAt],
    ["Customer name", `${record.firstName} ${record.lastName}`.trim()],
    ["Email", record.email],
    ["Phone", record.mobile],
    ["Service address", address],
    ["Property type", record.propertyType],
    ["Square footage", record.squareFootage],
    ["Bedrooms", record.bedrooms],
    ["Bathrooms", record.bathrooms],
    ["Cleaning type", record.cleaningType],
    ["Extras", extrasText],
    ["Frequency", record.frequency],
    ["Appointment date", record.serviceDate],
    ["Arrival window", record.arrivalWindow],
    ["Someone home", record.someoneHome],
    ["Special instructions", record.specialInstructions.trim().length > 0 ? record.specialInstructions : "None"],
    ["Estimated duration", `${record.estimatedDurationMinutes} min`],
    ["Total", String(record.totalPrice)],
    ["Booking status", record.bookingStatus],
    ["Payment status", record.paymentStatus],
  ];

  const text = [`New booking received — ${record.bookingId}`, "", ...rows.map(([label, value]) => `${label}: ${value}`)].join(
    "\n",
  );

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <h1 style="font-size:18px;">New booking received — ${escapeHtml(record.bookingId)}</h1>
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

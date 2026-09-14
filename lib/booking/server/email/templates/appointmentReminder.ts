// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Sent to the customer approximately 72 hours before their scheduled
// cleaning (see reminderService.ts). Embeds a directly-usable Manage
// Booking link built from `manageToken` — a fresh, independent token
// minted by reminderService.ts for this specific attempt, never a
// rotation of the original booking-confirmation token (which cannot be
// recovered from its stored hash — see manageToken.ts). Both the original
// and this reminder-issued link remain valid, indefinitely, for the same
// booking; see docs/manage-booking.md for the full rationale.
import "server-only";
import { businessConfig } from "@/lib/config";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import { formatReadableDate, getScheduleDisplayLabel } from "@/lib/booking/schedule";
import { getCleaningTypeIdForLabel } from "@/lib/booking/config";
import { getServiceScope, isAddOnType } from "@/lib/serviceDefinitions";
import { describeExtras } from "../../extrasDescription";
import { parseExtrasKeys } from "../../extras";
import { buildManageBookingUrl } from "../../manageToken";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

/**
 * Resolves this booking's service-scope (includes/excludes/selected
 * add-ons) from the one centralized definition in serviceDefinitions.ts —
 * see getServiceScope. Returns null only if the persisted Cleaning Type
 * label doesn't match any known service (should not happen for a booking
 * written by this app's current code); the email simply omits the scope
 * section rather than failing to send.
 */
function resolveServiceScope(record: BookingRecord) {
  const serviceType = getCleaningTypeIdForLabel(record.cleaningType);
  if (!serviceType) return null;
  const addOnKeys = parseExtrasKeys(record.extras).filter(isAddOnType);
  return getServiceScope(serviceType, addOnKeys);
}

export function buildAppointmentReminderEmail(record: BookingRecord, manageToken: string): Omit<EmailMessage, "to"> {
  const subject = `BeLa Cleaning — Reminder: your cleaning is coming up (${record.bookingId})`;
  const scheduleLabel = getScheduleDisplayLabel(record);
  const extras = describeExtras(record.extras);
  const address = [record.streetAddress, record.apartmentOrUnit].filter(Boolean).join(", ");
  const manageUrl = buildManageBookingUrl(manageToken);
  const scope = resolveServiceScope(record);

  const lines: string[] = [
    `Hi ${record.firstName},`,
    "",
    `This is a reminder that your BeLa Cleaning appointment is coming up.`,
    "",
    `Booking ID: ${record.bookingId}`,
    `Service date: ${formatReadableDate(record.serviceDate)}`,
    `Appointment time: ${scheduleLabel}`,
    `Service address: ${address}`,
    `Cleaning type: ${record.cleaningType}`,
    ...(extras.length > 0 ? [`Extras: ${extras.join(", ")}`] : []),
    `Estimated duration: ${formatDuration(record.estimatedDurationMinutes)}`,
    `Booking total: ${formatCurrency(record.chargeAmount)}`,
    "",
    `Manage your booking (view, reschedule, or cancel): ${manageUrl}`,
    "",
    "Cancellation and rescheduling policy:",
    "- More than 24 hours before your appointment: free cancellation or rescheduling.",
    "- Within 24 hours of your appointment: cancellations are subject to a late-cancellation fee equal to 50% of the booking total, and self-service rescheduling is unavailable — please contact us directly.",
  ];

  if (scope) {
    lines.push(
      "",
      `Your ${scope.serviceName} includes:`,
      ...scope.includes.map((item) => `- ${item}`),
      "",
      "Your service does not include:",
      ...scope.excludes.map((item) => `- ${item}`),
    );
    if (scope.selectedAddOns.length > 0) {
      lines.push("", "Your selected add-ons:", ...scope.selectedAddOns.map((addOn) => `- ${addOn.name}`));
    }
  }

  lines.push(
    "",
    "Questions? We're happy to help.",
    `${businessConfig.email}  •  ${businessConfig.phoneDisplay}`,
    "",
    "— The BeLa Cleaning Team",
  );

  const text = lines.join("\n");

  const scopeSectionHtml = scope
    ? `
  <p style="font-size:14px;color:#8A7A6B;margin:20px 0 4px;">Your ${escapeHtml(scope.serviceName)} includes</p>
  <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;">
    ${scope.includes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
  </ul>
  <p style="font-size:14px;color:#8A7A6B;margin:0 0 4px;">Your service does not include</p>
  <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;">
    ${scope.excludes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
  </ul>
  ${
    scope.selectedAddOns.length > 0
      ? `<p style="font-size:14px;color:#8A7A6B;margin:0 0 4px;">Your selected add-ons</p>
  <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;">
    ${scope.selectedAddOns.map((addOn) => `<li>${escapeHtml(addOn.name)}</li>`).join("")}
  </ul>`
      : ""
  }`
    : "";

  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#3B2F27;">
  <h1 style="font-size:22px;margin:0 0 16px;">Your cleaning is coming up</h1>
  <p>Hi ${escapeHtml(record.firstName)},</p>
  <p>This is a reminder that your BeLa Cleaning appointment is coming up.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <tr><td style="padding:4px 0;color:#8A7A6B;">Booking ID</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.bookingId)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service date</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatReadableDate(record.serviceDate))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Appointment time</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(scheduleLabel)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service address</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(address)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Cleaning type</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.cleaningType)}</td></tr>
    ${extras.length > 0 ? `<tr><td style="padding:4px 0;color:#8A7A6B;">Extras</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(extras.join(", "))}</td></tr>` : ""}
    <tr><td style="padding:4px 0;color:#8A7A6B;">Estimated duration</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatDuration(record.estimatedDurationMinutes))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Booking total</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(record.chargeAmount))}</td></tr>
  </table>
  <p style="margin:20px 0;">
    <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:#3B2F27;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:600;">Manage Booking</a>
  </p>
  <p style="font-size:13px;color:#6B5B4C;">
    <strong>Cancellation and rescheduling policy:</strong> more than 24 hours before your appointment, cancellation or
    rescheduling is free. Within 24 hours, cancellations are subject to a late-cancellation fee equal to 50% of the
    booking total, and self-service rescheduling is unavailable — please contact us directly.
  </p>
  ${scopeSectionHtml}
  <p style="font-size:14px;">
    Questions? We're happy to help.<br/>
    ${escapeHtml(businessConfig.email)} &bull; ${escapeHtml(businessConfig.phoneDisplay)}
  </p>
  <p style="font-size:14px;">— The BeLa Cleaning Team</p>
</div>`.trim();

  return { subject, text, html };
}

// SERVER-ONLY. Pure template functions — no I/O, fully unit-testable.
// The emails specific to automatic recurring appointments:
//   1. customer: "your next cleaning is scheduled" (with its own Manage
//      Booking link and the two clearly separate controls);
//   2. owner: "a recurring appointment was created and needs assignment";
//   3. owner: "a recurring schedule needs your attention".
// Cleaner assignment stays manual — nothing here chooses or notifies a
// cleaner.
import "server-only";
import { businessConfig } from "@/lib/config";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import { formatReadableDate, getScheduleDisplayLabel } from "@/lib/booking/schedule";
import { followUpAppliedNoticeForLabel, getSavedQuoteKind } from "@/lib/booking/recurringPricing";
import { buildManageBookingUrl } from "../../manageToken";
import type { BookingRecord } from "../../types";
import type { RecurringScheduleRecord } from "../../recurringScheduleSchema";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export const MANAGE_ACTION_CANCEL_ONE = "cancel-one";
export const MANAGE_ACTION_STOP = "stop";

/** Manage Booking deep links for the two separate recurring controls. */
export function buildRecurringControlUrls(manageToken: string): { manage: string; cancelOne: string; stop: string } {
  const manage = buildManageBookingUrl(manageToken);
  return {
    manage,
    cancelOne: `${manage}?action=${MANAGE_ACTION_CANCEL_ONE}`,
    stop: `${manage}?action=${MANAGE_ACTION_STOP}`,
  };
}

function addressOf(record: BookingRecord): string {
  return [record.streetAddress, record.apartmentOrUnit, `${record.city}, ${record.state} ${record.zipCode}`]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");
}

export function buildCustomerRecurringAppointmentScheduledEmail(
  record: BookingRecord,
  manageToken: string,
): Omit<EmailMessage, "to"> {
  const kind = getSavedQuoteKind({
    frequencyLabel: record.frequency,
    pricingPolicy: record.pricingPolicy,
    frequencyDiscount: record.frequencyDiscount,
  });
  const urls = buildRecurringControlUrls(manageToken);
  const subject = `BeLa Cleaning — Your next cleaning is scheduled (${record.serviceDate})`;
  const when = formatReadableDate(record.serviceDate);
  const time = getScheduleDisplayLabel(record);
  const discountLine =
    kind === "follow-up" ? `${record.frequency} discount applied: -${formatCurrency(record.frequencyDiscount)}` : "";
  const appliedNotice = kind === "follow-up" ? followUpAppliedNoticeForLabel(record.frequency) : "";

  const lines = [
    `Hi ${record.firstName},`,
    "",
    `Your next ${record.frequency.toLowerCase()} cleaning has been scheduled automatically:`,
    "",
    `Booking ID: ${record.bookingId}`,
    `Service date: ${when}`,
    `Appointment time: ${time}`,
    `Service address: ${addressOf(record)}`,
    `Cleaning type: ${record.cleaningType}`,
    `Estimated duration: ${formatDuration(record.estimatedDurationMinutes)}`,
    ...(discountLine ? [discountLine] : []),
    `Total: ${formatCurrency(record.chargeAmount)}`,
    "",
    ...(appliedNotice ? [appliedNotice, ""] : []),
    "Your saved card will be charged automatically one hour after this cleaning ends. We'll send a reminder about 72 hours beforehand.",
    "",
    "Need a change? These two options are separate:",
    `- Cancel this cleaning only (your recurring cleanings continue): ${urls.cancelOne}`,
    `- Stop recurring cleanings (no further cleanings will be scheduled): ${urls.stop}`,
    `- View or reschedule this cleaning: ${urls.manage}`,
    "",
    "Cancelling or stopping more than 24 hours before the cleaning is free. Within 24 hours a late-cancellation fee of 50% of the total applies.",
    "",
    `Questions? ${businessConfig.email} • ${businessConfig.phoneDisplay}`,
    "",
    "— The BeLa Cleaning Team",
  ];

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;color:#8A7A6B;">${escapeHtml(label)}</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(value)}</td></tr>`;
  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:4px 6px 4px 0;${
      primary ? "background:#3B2F27;color:#ffffff;" : "border:2px solid #3B2F27;color:#3B2F27;"
    }text-decoration:none;padding:10px 20px;border-radius:999px;font-size:14px;font-weight:600;">${escapeHtml(label)}</a>`;

  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#3B2F27;">
  <h1 style="font-size:22px;margin:0 0 16px;">Your next cleaning is scheduled</h1>
  <p>Hi ${escapeHtml(record.firstName)},</p>
  <p>Your next ${escapeHtml(record.frequency.toLowerCase())} cleaning has been scheduled automatically.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    ${row("Booking ID", record.bookingId)}
    ${row("Service date", when)}
    ${row("Appointment time", time)}
    ${row("Service address", addressOf(record))}
    ${row("Cleaning type", record.cleaningType)}
    ${row("Estimated duration", formatDuration(record.estimatedDurationMinutes))}
    ${discountLine ? row(`${record.frequency} discount applied`, `-${formatCurrency(record.frequencyDiscount)}`) : ""}
    ${row("Total", formatCurrency(record.chargeAmount))}
  </table>
  ${appliedNotice ? `<p style="font-size:14px;color:#6B5B4C;">${escapeHtml(appliedNotice)}</p>` : ""}
  <p style="font-size:14px;color:#6B5B4C;">
    Your saved card will be charged automatically one hour after this cleaning ends. We'll send a reminder about 72
    hours beforehand.
  </p>
  <p style="margin:20px 0 4px;font-size:14px;"><strong>Need a change?</strong> These two options are separate:</p>
  <p style="margin:0 0 4px;">${button(urls.cancelOne, "Cancel this cleaning only", false)}</p>
  <p style="margin:0 0 4px;font-size:13px;color:#6B5B4C;">Your recurring cleanings continue.</p>
  <p style="margin:12px 0 4px;">${button(urls.stop, "Stop recurring cleanings", false)}</p>
  <p style="margin:0 0 16px;font-size:13px;color:#6B5B4C;">No further cleanings will be scheduled.</p>
  <p style="margin:0 0 16px;">${button(urls.manage, "View or reschedule this cleaning", true)}</p>
  <p style="font-size:13px;color:#6B5B4C;">
    Cancelling or stopping more than 24 hours before the cleaning is free. Within 24 hours a late-cancellation fee of
    50% of the total applies.
  </p>
  <p style="font-size:14px;">
    Questions? We're happy to help.<br/>
    ${escapeHtml(businessConfig.email)} &bull; ${escapeHtml(businessConfig.phoneDisplay)}
  </p>
  <p style="font-size:14px;">— The BeLa Cleaning Team</p>
</div>`.trim();

  return { subject, text: lines.join("\n"), html };
}

export function buildInternalRecurringAppointmentCreatedEmail(record: BookingRecord): Omit<EmailMessage, "to"> {
  const subject = `[Needs assignment] Recurring appointment ${record.bookingId} — ${record.serviceDate}`;
  const rows: Array<[string, string]> = [
    ["Booking ID", record.bookingId],
    ["Recurring schedule", record.recurringScheduleId],
    ["Occurrence", String(record.occurrenceNumber)],
    ["Customer", `${record.firstName} ${record.lastName}`.trim()],
    ["Email", record.email],
    ["Phone", record.mobile],
    ["Service address", addressOf(record)],
    ["Frequency", record.frequency],
    ["Service date", record.serviceDate],
    ["Appointment time", getScheduleDisplayLabel(record)],
    ["Cleaning type", record.cleaningType],
    ["Estimated duration", `${record.estimatedDurationMinutes} min`],
    ["Frequency discount", String(record.frequencyDiscount)],
    ["Total", String(record.totalPrice)],
  ];
  const text = [
    "A recurring appointment was created automatically and needs a cleaner assigned.",
    "It now appears in the assignable-bookings list.",
    "",
    ...rows.map(([l, v]) => `${l}: ${v}`),
  ].join("\n");
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <h1 style="font-size:18px;">Recurring appointment needs a cleaner — ${escapeHtml(record.bookingId)}</h1>
  <p style="font-size:13px;">Created automatically. It now appears in the assignable-bookings list.</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 8px;color:#666;border-bottom:1px solid #eee;">${escapeHtml(label)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(value)}</td></tr>`,
      )
      .join("")}
  </table>
</div>`.trim();
  return { subject, text, html };
}

export type RecurringScheduleAlertContent = {
  code: string;
  headline: string;
  detail: string;
  occurrenceNumber?: number;
};

export function buildInternalRecurringScheduleAlertEmail(
  schedule: RecurringScheduleRecord,
  alert: RecurringScheduleAlertContent,
): Omit<EmailMessage, "to"> {
  const subject = `[Recurring schedule] ${alert.headline}`;
  const rows: Array<[string, string]> = [
    ["Issue", alert.code],
    ["Schedule ID", schedule.scheduleId],
    ["Status", schedule.status],
    ["Customer", `${schedule.firstName} ${schedule.lastName}`.trim()],
    ["Email", schedule.email],
    ["Phone", schedule.mobile],
    ["Frequency", schedule.frequency],
    ["Anchor date", `${schedule.anchorDate} ${schedule.anchorStartTime}`],
    ["Occurrence", alert.occurrenceNumber ? String(alert.occurrenceNumber) : "—"],
  ];
  const text = [alert.headline, "", alert.detail, "", ...rows.map(([l, v]) => `${l}: ${v}`)].join("\n");
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;">
  <h1 style="font-size:18px;">${escapeHtml(alert.headline)}</h1>
  <p style="font-size:14px;">${escapeHtml(alert.detail)}</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 8px;color:#666;border-bottom:1px solid #eee;">${escapeHtml(label)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(value)}</td></tr>`,
      )
      .join("")}
  </table>
</div>`.trim();
  return { subject, text, html };
}

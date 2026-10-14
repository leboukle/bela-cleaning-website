// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Builds the customer-facing "booking received" email. Every value comes
// from the already-validated, already-persisted BookingRecord; nothing
// here re-reads customer input, and nothing here exposes Google Sheets,
// spreadsheet IDs, or any other infrastructure detail — only what the
// customer themselves already provided plus the server-computed price and
// duration.
import "server-only";
import { businessConfig } from "@/lib/config";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import { formatReadableDate, getScheduleDisplayLabel } from "@/lib/booking/schedule";
import { getCleaningTypeIdForLabel } from "@/lib/booking/config";
import {
  FIRST_CLEANING_NOTICE,
  followUpAppliedNoticeForLabel,
  getSavedQuoteKind,
  getTotalLabel,
} from "@/lib/booking/recurringPricing";
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

export function buildCustomerBookingReceivedEmail(record: BookingRecord, manageToken: string): Omit<EmailMessage, "to"> {
  const subject = `BeLa Cleaning — Booking ${record.bookingId}`;
  const manageUrl = buildManageBookingUrl(manageToken);
  const address = [record.streetAddress, record.apartmentOrUnit, `${record.city}, ${record.state} ${record.zipCode}`]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");
  const extras = describeExtras(record.extras);
  const isRecurring = record.frequency !== "One time";
  const scope = resolveServiceScope(record);
  // Wording follows what was SAVED. A recurring booking saved under the
  // first-cleaning-at-full-price policy with no frequency discount IS the
  // first cleaning and is told so. A discounted follow-up shows its actual
  // discount and total and never claims to be a first cleaning. Older rows
  // (blank policy) keep the plain "Estimated total" wording.
  const quoteKind = getSavedQuoteKind({
    frequencyLabel: record.frequency,
    pricingPolicy: record.pricingPolicy,
    frequencyDiscount: record.frequencyDiscount,
  });
  const isFirstCleaning = quoteKind === "first-cleaning";
  const isFollowUp = quoteKind === "follow-up";
  const totalLabel = getTotalLabel(quoteKind);
  const policyLines = isFirstCleaning
    ? [FIRST_CLEANING_NOTICE]
    : isFollowUp
      ? [followUpAppliedNoticeForLabel(record.frequency)]
      : [];

  const lines: string[] = [
    `Hi ${record.firstName},`,
    "",
    "We've received your cleaning request. Here's a summary of what you booked:",
    "",
    `Booking ID: ${record.bookingId}`,
    `Cleaning type: ${record.cleaningType}`,
    `Service date: ${formatReadableDate(record.serviceDate)}`,
    `Appointment time: ${getScheduleDisplayLabel(record)}`,
    `Service address: ${address}`,
    `Estimated duration: ${formatDuration(record.estimatedDurationMinutes)}`,
    `${totalLabel}: ${formatCurrency(record.totalPrice)}`,
  ];
  if (isRecurring) lines.push(`Frequency: ${record.frequency}`);
  if (isFollowUp) lines.push(`${record.frequency} discount applied: -${formatCurrency(record.frequencyDiscount)}`);
  if (extras.length > 0) lines.push(`Extras: ${extras.join(", ")}`);

  lines.push(
    "",
    `Status: ${record.bookingStatus}. Your payment method has been saved securely — you have not been charged.`,
    `The estimated total above will be charged automatically starting 1 hour after your cleaning's scheduled`,
    "end time. Please keep your Booking ID for reference.",
    ...(policyLines.length > 0 ? ["", ...policyLines] : []),
    "",
    "Need to change or cancel your appointment? Manage your booking here:",
    manageUrl,
    "",
    "Cancel more than 24 hours before your scheduled cleaning at no charge. Cancellations made within 24 hours",
    "of the scheduled start time are subject to a late-cancellation fee equal to 50% of the booking total,",
    "charged automatically to your saved payment method.",
  );

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
    `${businessConfig.customerServiceDays}, ${businessConfig.customerServiceTime}`,
    "",
    "— The BeLa Cleaning Team",
  );

  const text = lines.join("\n");

  const extrasRow =
    extras.length > 0
      ? `<tr><td style="padding:4px 0;color:#8A7A6B;">Extras</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(extras.join(", "))}</td></tr>`
      : "";
  const frequencyRow = isRecurring
    ? `<tr><td style="padding:4px 0;color:#8A7A6B;">Frequency</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.frequency)}</td></tr>`
    : "";
  const discountRow = isFollowUp
    ? `<tr><td style="padding:4px 0;color:#8A7A6B;">${escapeHtml(record.frequency)} discount applied</td><td style="padding:4px 0;text-align:right;font-weight:600;">-${escapeHtml(formatCurrency(record.frequencyDiscount))}</td></tr>`
    : "";

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
  <h1 style="font-size:22px;margin:0 0 16px;">Booking request received</h1>
  <p>Hi ${escapeHtml(record.firstName)},</p>
  <p>We've received your cleaning request. Here's a summary of what you booked:</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <tr><td style="padding:4px 0;color:#8A7A6B;">Booking ID</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.bookingId)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Cleaning type</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.cleaningType)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service date</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatReadableDate(record.serviceDate))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Appointment time</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(getScheduleDisplayLabel(record))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service address</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(address)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Estimated duration</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatDuration(record.estimatedDurationMinutes))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">${escapeHtml(totalLabel)}</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(record.totalPrice))}</td></tr>
    ${frequencyRow}
    ${discountRow}
    ${extrasRow}
  </table>
  <p style="font-size:14px;color:#6B5B4C;">
    Status: <strong>${escapeHtml(record.bookingStatus)}</strong>. Your payment method has been saved securely —
    you have not been charged. The estimated total above will be charged automatically starting 1 hour after your
    cleaning's scheduled end time. Please keep your Booking ID for reference.
  </p>
  ${
    policyLines.length > 0
      ? `<p style="font-size:14px;color:#6B5B4C;">${escapeHtml(policyLines.join(" "))}</p>`
      : ""
  }
  <p style="text-align:center;margin:24px 0;">
    <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:#3B2F27;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:600;">Manage Booking</a>
  </p>
  <p style="font-size:14px;color:#6B5B4C;">
    Cancel more than 24 hours before your scheduled cleaning at no charge. Cancellations made within 24 hours of
    the scheduled start time are subject to a late-cancellation fee equal to 50% of the booking total, charged
    automatically to your saved payment method.
  </p>
  ${scopeSectionHtml}
  <p style="font-size:14px;">
    Questions? We're happy to help.<br/>
    ${escapeHtml(businessConfig.email)} &bull; ${escapeHtml(businessConfig.phoneDisplay)}<br/>
    ${escapeHtml(businessConfig.customerServiceDays)}, ${escapeHtml(businessConfig.customerServiceTime)}
  </p>
  <p style="font-size:14px;">— The BeLa Cleaning Team</p>
</div>`.trim();

  return { subject, text, html };
}

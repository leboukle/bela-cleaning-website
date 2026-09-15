// SERVER-ONLY. Pure template function — no I/O, fully unit-testable.
// Sent once, after BeLa explicitly marks a booking's "Completed At"
// (see completionService.ts) — never inferred from elapsed/scheduled
// time. BeLa pays cleaners manually in V1: this email deliberately never
// claims payment has been sent or is "on the way," never mentions tips,
// and never initiates any payout itself.
import "server-only";
import { businessConfig } from "@/lib/config";
import { formatCurrency } from "@/lib/booking/calculate";
import { formatReadableDate } from "@/lib/booking/schedule";
import type { AssignmentRecord } from "../../cleanerTypes";
import type { BookingRecord } from "../../types";
import type { EmailMessage } from "../emailTransport";
import { escapeHtml } from "../emailHtml";

export function buildCleanerPayoutStatementEmail(record: BookingRecord, cleanerFirstName: string, assignment: AssignmentRecord): Omit<EmailMessage, "to"> {
  const subject = `BeLa Cleaning — Payout Statement (${record.bookingId})`;
  const payoutPercentLabel = `${Math.round(assignment.payoutPercentageSnapshot * 100)}%`;

  const text = [
    `Hi ${cleanerFirstName},`,
    "",
    "Thank you for completing your BeLa Cleaning assignment.",
    "",
    `Booking ID: ${record.bookingId}`,
    `Service: ${record.cleaningType}`,
    `Service date: ${formatReadableDate(record.serviceDate)}`,
    `Cleaning total: ${formatCurrency(record.chargeAmount)}`,
    `Your payout (${payoutPercentLabel}): ${formatCurrency(assignment.payoutAmountSnapshot)}`,
    "",
    "Please expect to receive your payment within 24 hours of the completed cleaning.",
    "",
    "Questions? We're happy to help.",
    `${businessConfig.email}  •  ${businessConfig.phoneDisplay}`,
    "",
    "— The BeLa Cleaning Team",
  ].join("\n");

  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#3B2F27;">
  <h1 style="font-size:22px;margin:0 0 16px;">Payout statement</h1>
  <p>Hi ${escapeHtml(cleanerFirstName)},</p>
  <p>Thank you for completing your BeLa Cleaning assignment.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <tr><td style="padding:4px 0;color:#8A7A6B;">Booking ID</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.bookingId)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(record.cleaningType)}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Service date</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatReadableDate(record.serviceDate))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Cleaning total</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(record.chargeAmount))}</td></tr>
    <tr><td style="padding:4px 0;color:#8A7A6B;">Your payout (${escapeHtml(payoutPercentLabel)})</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#1E5B3A;">${escapeHtml(formatCurrency(assignment.payoutAmountSnapshot))}</td></tr>
  </table>
  <p style="font-size:14px;color:#6B5B4C;">Please expect to receive your payment within 24 hours of the completed cleaning.</p>
  <p style="font-size:14px;">
    Questions? We're happy to help.<br/>
    ${escapeHtml(businessConfig.email)} &bull; ${escapeHtml(businessConfig.phoneDisplay)}
  </p>
  <p style="font-size:14px;">— The BeLa Cleaning Team</p>
</div>`.trim();

  return { subject, text, html };
}

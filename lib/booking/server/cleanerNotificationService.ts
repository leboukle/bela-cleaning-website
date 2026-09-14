// SERVER-ONLY. Milestone 7's cleaner-assignment email orchestration —
// mirrors notificationService.ts's class-based pattern exactly, but kept
// as its own class rather than added to NotificationService: cleaner
// communications are a distinct bounded concern, and this keeps the
// existing customer-facing NotificationService completely untouched by
// this milestone.
import "server-only";
import type { EmailTransport } from "./email/emailTransport";
import { buildCleanerAssignmentOfferEmail, type AssignmentOfferDetail } from "./email/templates/cleanerAssignmentOffer";
import { buildInternalAssignmentAcceptedEmail } from "./email/templates/internalAssignmentAccepted";
import { buildInternalAssignmentDeclinedEmail } from "./email/templates/internalAssignmentDeclined";
import { buildInternalAssignmentExpiredEmail } from "./email/templates/internalAssignmentExpired";
import { buildCleanerAppointmentReminderEmail } from "./email/templates/cleanerAppointmentReminder";
import { buildCleanerPayoutStatementEmail } from "./email/templates/cleanerPayoutStatement";
import { getInternalNotificationEmail } from "./email/gmailAuth";
import type { AssignmentRecord, CleanerRecord } from "./cleanerTypes";
import type { BookingRecord } from "./types";

export type CleanerNotificationResult = { ok: true } | { ok: false; error: string };

export class CleanerNotificationService {
  constructor(private readonly transport: EmailTransport) {}

  /** Sends the initial cleaner-facing assignment offer, with the Accept/Decline page link. */
  async sendCleanerAssignmentOffer(record: BookingRecord, cleaner: CleanerRecord, offer: AssignmentOfferDetail): Promise<CleanerNotificationResult> {
    const { subject, text, html } = buildCleanerAssignmentOfferEmail(record, cleaner, offer);
    return this.transport.send({ to: cleaner.email, subject, text, html });
  }

  private async sendInternal(build: () => { subject: string; text: string; html: string }): Promise<CleanerNotificationResult> {
    let internalEmail: string;
    try {
      internalEmail = getInternalNotificationEmail();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Missing internal notification recipient configuration." };
    }
    const { subject, text, html } = build();
    return this.transport.send({ to: internalEmail, subject, text, html });
  }

  /** Internal notification sent to BeLa staff when a cleaner accepts an assignment. */
  async sendInternalAssignmentAccepted(record: BookingRecord, assignment: AssignmentRecord): Promise<CleanerNotificationResult> {
    return this.sendInternal(() => buildInternalAssignmentAcceptedEmail(record, assignment));
  }

  /** Internal notification sent to BeLa staff when a cleaner declines an assignment. */
  async sendInternalAssignmentDeclined(record: BookingRecord, assignment: AssignmentRecord): Promise<CleanerNotificationResult> {
    return this.sendInternal(() => buildInternalAssignmentDeclinedEmail(record, assignment));
  }

  /** Internal notification sent to BeLa staff when an assignment's response window expires with no reply. */
  async sendInternalAssignmentExpired(record: BookingRecord, assignment: AssignmentRecord): Promise<CleanerNotificationResult> {
    return this.sendInternal(() => buildInternalAssignmentExpiredEmail(record, assignment));
  }

  /** Sends the 72-hour cleaner reminder — Accepted assignments only, no Accept/Decline controls. */
  async sendCleanerAppointmentReminder(record: BookingRecord, cleaner: CleanerRecord, assignment: AssignmentRecord): Promise<CleanerNotificationResult> {
    const { subject, text, html } = buildCleanerAppointmentReminderEmail(record, cleaner.firstName, assignment);
    return this.transport.send({ to: cleaner.email, subject, text, html });
  }

  /** Sends the post-cleaning payout statement — only after Completed At is set (see completionService.ts). */
  async sendCleanerPayoutStatement(record: BookingRecord, cleaner: CleanerRecord, assignment: AssignmentRecord): Promise<CleanerNotificationResult> {
    const { subject, text, html } = buildCleanerPayoutStatementEmail(record, cleaner.firstName, assignment);
    return this.transport.send({ to: cleaner.email, subject, text, html });
  }
}

/** The narrow slice of CleanerNotificationService assignmentService.ts depends on. */
export type CleanerAssignmentNotificationSender = Pick<
  CleanerNotificationService,
  "sendCleanerAssignmentOffer" | "sendInternalAssignmentAccepted" | "sendInternalAssignmentDeclined" | "sendInternalAssignmentExpired"
>;

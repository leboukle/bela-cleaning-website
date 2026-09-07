// SERVER-ONLY. The booking workflow depends on this abstraction, never on
// a specific email vendor — swapping the underlying transport later (see
// email/emailTransport.ts) never requires touching bookingService.ts or
// any of the two call sites below. Mirrors the BookingRepository pattern
// already established for Google Sheets in repository.ts.
import "server-only";
import type { EmailTransport } from "./email/emailTransport";
import { buildCustomerBookingReceivedEmail } from "./email/templates/customerBookingReceived";
import { buildInternalNewBookingEmail } from "./email/templates/internalNewBooking";
import { buildPaymentReceiptEmail } from "./email/templates/paymentReceipt";
import { buildInternalPaymentSucceededEmail } from "./email/templates/internalPaymentSucceeded";
import { buildInternalPaymentFailedEmail, type PaymentFailureNotificationDetail } from "./email/templates/internalPaymentFailed";
import { buildFreeCancellationConfirmationEmail } from "./email/templates/freeCancellationConfirmation";
import { buildLateCancellationConfirmationEmail } from "./email/templates/lateCancellationConfirmation";
import { buildInternalCancellationEmail, type InternalCancellationDetail } from "./email/templates/internalCancellationNotification";
import { buildInternalCancellationFeeFailedEmail } from "./email/templates/internalCancellationFeeFailed";
import { buildRescheduleConfirmationEmail, type RescheduleChange } from "./email/templates/rescheduleConfirmation";
import { buildInternalRescheduleEmail } from "./email/templates/internalRescheduleNotification";
import { buildAppointmentReminderEmail } from "./email/templates/appointmentReminder";
import { buildInternalReminderSentEmail } from "./email/templates/internalReminderSent";
import { buildInternalReminderFailedEmail } from "./email/templates/internalReminderFailed";
import { getInternalNotificationEmail } from "./email/gmailAuth";
import type { PaymentIntentFailureDetail } from "./stripe/paymentIntent";
import type { BookingRecord } from "./types";

export type NotificationResult = { ok: true } | { ok: false; error: string };

export class NotificationService {
  constructor(private readonly transport: EmailTransport) {}

  /** Sends the customer-facing "booking received" email, including the Manage Booking link. */
  async sendCustomerBookingReceived(record: BookingRecord, manageToken: string): Promise<NotificationResult> {
    const { subject, text, html } = buildCustomerBookingReceivedEmail(record, manageToken);
    return this.transport.send({ to: record.email, subject, text, html });
  }

  /**
   * Sends the internal, operational new-booking notification. The
   * recipient always comes from BELA_INTERNAL_NOTIFICATION_EMAIL — never
   * from the booking record or any customer-controlled value, so a
   * customer can never redirect this email to themselves or a third
   * party.
   */
  async sendInternalNewBookingNotification(record: BookingRecord): Promise<NotificationResult> {
    let internalEmail: string;
    try {
      internalEmail = getInternalNotificationEmail();
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Missing internal notification recipient configuration.",
      };
    }
    const { subject, text, html } = buildInternalNewBookingEmail(record);
    return this.transport.send({ to: internalEmail, subject, text, html });
  }

  /**
   * Sends the customer-facing payment receipt. Only ever called after the
   * Stripe webhook confirms payment_intent.succeeded — never from the
   * synchronous process-due response (see docs/payments.md).
   */
  async sendPaymentReceipt(record: BookingRecord): Promise<NotificationResult> {
    const { subject, text, html } = buildPaymentReceiptEmail(record);
    return this.transport.send({ to: record.email, subject, text, html });
  }

  /** Internal notification sent to BeLa staff when a scheduled charge succeeds. */
  async sendInternalPaymentSucceeded(record: BookingRecord): Promise<NotificationResult> {
    let internalEmail: string;
    try {
      internalEmail = getInternalNotificationEmail();
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Missing internal notification recipient configuration.",
      };
    }
    const { subject, text, html } = buildInternalPaymentSucceededEmail(record);
    return this.transport.send({ to: internalEmail, subject, text, html });
  }

  /**
   * Internal notification sent to BeLa staff on every failed payment
   * attempt — per the approved retry policy, this fires regardless of
   * whether the failure is retryable, non-retryable, or requires customer
   * action.
   */
  async sendInternalPaymentFailed(record: BookingRecord, detail: PaymentFailureNotificationDetail): Promise<NotificationResult> {
    let internalEmail: string;
    try {
      internalEmail = getInternalNotificationEmail();
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Missing internal notification recipient configuration.",
      };
    }
    const { subject, text, html } = buildInternalPaymentFailedEmail(record, detail);
    return this.transport.send({ to: internalEmail, subject, text, html });
  }

  /** Sends the customer-facing confirmation for a free (>24h) cancellation. */
  async sendFreeCancellationConfirmation(record: BookingRecord): Promise<NotificationResult> {
    const { subject, text, html } = buildFreeCancellationConfirmationEmail(record);
    return this.transport.send({ to: record.email, subject, text, html });
  }

  /** Sends the customer-facing confirmation for a late (<=24h) cancellation, stating the 50% fee amount. */
  async sendLateCancellationConfirmation(record: BookingRecord): Promise<NotificationResult> {
    const { subject, text, html } = buildLateCancellationConfirmationEmail(record);
    return this.transport.send({ to: record.email, subject, text, html });
  }

  /** Internal notification sent to BeLa staff on every self-service cancellation, free or late. */
  async sendInternalCancellationNotification(record: BookingRecord, detail: InternalCancellationDetail): Promise<NotificationResult> {
    let internalEmail: string;
    try {
      internalEmail = getInternalNotificationEmail();
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Missing internal notification recipient configuration.",
      };
    }
    const { subject, text, html } = buildInternalCancellationEmail(record, detail);
    return this.transport.send({ to: internalEmail, subject, text, html });
  }

  /**
   * Internal notification sent to BeLa staff when a late-cancellation fee
   * charge fails. The booking remains Cancelled regardless — this is
   * purely informational so staff can follow up manually.
   */
  async sendInternalCancellationFeeFailed(record: BookingRecord, failure: PaymentIntentFailureDetail): Promise<NotificationResult> {
    let internalEmail: string;
    try {
      internalEmail = getInternalNotificationEmail();
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Missing internal notification recipient configuration.",
      };
    }
    const { subject, text, html } = buildInternalCancellationFeeFailedEmail(record, failure);
    return this.transport.send({ to: internalEmail, subject, text, html });
  }

  /** Sends the customer-facing confirmation for a successful self-service reschedule. */
  async sendRescheduleConfirmation(record: BookingRecord, change: RescheduleChange): Promise<NotificationResult> {
    const { subject, text, html } = buildRescheduleConfirmationEmail(record, change);
    return this.transport.send({ to: record.email, subject, text, html });
  }

  /** Internal notification sent to BeLa staff on every self-service reschedule. */
  async sendInternalRescheduleNotification(record: BookingRecord, change: RescheduleChange): Promise<NotificationResult> {
    let internalEmail: string;
    try {
      internalEmail = getInternalNotificationEmail();
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Missing internal notification recipient configuration.",
      };
    }
    const { subject, text, html } = buildInternalRescheduleEmail(record, change);
    return this.transport.send({ to: internalEmail, subject, text, html });
  }

  /**
   * Sends the customer-facing 72-hour appointment reminder, including a
   * directly-usable Manage Booking link built from `manageToken` — a
   * fresh, independent token minted by reminderService.ts for this
   * attempt (never the original booking-confirmation token, which cannot
   * be recovered from its stored hash).
   */
  async sendAppointmentReminder(record: BookingRecord, manageToken: string): Promise<NotificationResult> {
    const { subject, text, html } = buildAppointmentReminderEmail(record, manageToken);
    return this.transport.send({ to: record.email, subject, text, html });
  }

  /** Internal notification sent to BeLa staff confirming a reminder was sent successfully. */
  async sendInternalReminderSent(record: BookingRecord): Promise<NotificationResult> {
    let internalEmail: string;
    try {
      internalEmail = getInternalNotificationEmail();
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Missing internal notification recipient configuration.",
      };
    }
    const { subject, text, html } = buildInternalReminderSentEmail(record);
    return this.transport.send({ to: internalEmail, subject, text, html });
  }

  /** Internal notification sent to BeLa staff after the 3rd and final failed reminder attempt. */
  async sendInternalReminderFailed(record: BookingRecord, totalAttempts: number): Promise<NotificationResult> {
    let internalEmail: string;
    try {
      internalEmail = getInternalNotificationEmail();
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Missing internal notification recipient configuration.",
      };
    }
    const { subject, text, html } = buildInternalReminderFailedEmail(record, totalAttempts);
    return this.transport.send({ to: internalEmail, subject, text, html });
  }
}

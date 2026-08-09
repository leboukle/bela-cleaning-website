// SERVER-ONLY. The booking workflow depends on this abstraction, never on
// a specific email vendor — swapping the underlying transport later (see
// email/emailTransport.ts) never requires touching bookingService.ts or
// any of the two call sites below. Mirrors the BookingRepository pattern
// already established for Google Sheets in repository.ts.
import "server-only";
import type { EmailTransport } from "./email/emailTransport";
import { buildCustomerBookingReceivedEmail } from "./email/templates/customerBookingReceived";
import { buildInternalNewBookingEmail } from "./email/templates/internalNewBooking";
import { getInternalNotificationEmail } from "./email/gmailAuth";
import type { BookingRecord } from "./types";

export type NotificationResult = { ok: true } | { ok: false; error: string };

export class NotificationService {
  constructor(private readonly transport: EmailTransport) {}

  /** Sends the customer-facing "booking received" email. */
  async sendCustomerBookingReceived(record: BookingRecord): Promise<NotificationResult> {
    const { subject, text, html } = buildCustomerBookingReceivedEmail(record);
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
}

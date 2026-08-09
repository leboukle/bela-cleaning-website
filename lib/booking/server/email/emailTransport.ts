// SERVER-ONLY. Provider-agnostic email transport contract. Nothing above
// this interface (notificationService.ts, the booking workflow) knows or
// cares that Gmail is the current transport — swapping providers later
// means writing one new class that implements this interface and changing
// a single wiring point (see app/api/booking/route.ts), the same pattern
// already used for BookingRepository/GoogleSheetsBookingRepository.
import "server-only";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailSendResult = { ok: true } | { ok: false; error: string };

export interface EmailTransport {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

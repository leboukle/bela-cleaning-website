// SERVER-ONLY. The Gmail API implementation of EmailTransport. Uses a
// direct authenticated fetch to `users.messages.send` rather than the full
// `googleapis` SDK, mirroring sheetsClient.ts's minimal-dependency
// philosophy — this booking backend only ever needs this one endpoint.
import "server-only";
import { getGmailAccessToken, getGmailSenderEmail } from "./gmailAuth";
import { buildRawEmailMessage } from "./mimeMessage";
import type { EmailMessage, EmailSendResult, EmailTransport } from "./emailTransport";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const SENDER_DISPLAY_NAME = "BeLa Cleaning";

export class GmailApiTransport implements EmailTransport {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    let accessToken: string;
    let senderEmail: string;
    try {
      [accessToken, senderEmail] = await Promise.all([getGmailAccessToken(), Promise.resolve(getGmailSenderEmail())]);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Gmail authentication failed." };
    }

    const raw = buildRawEmailMessage({
      from: senderEmail,
      fromName: SENDER_DISPLAY_NAME,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    let res: Response;
    try {
      res = await fetch(GMAIL_SEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { ok: false, error: "Network error contacting the Gmail API." };
    }

    if (!res.ok) {
      // Sanitized: status only, never the response body — Gmail's error
      // payloads can echo request details, and this must never leak into
      // logs alongside customer data. See docs/notifications.md.
      console.error(`[gmailTransport] Gmail API send failed: status=${res.status}`);
      return { ok: false, error: `Gmail API request failed with status ${res.status}.` };
    }

    return { ok: true };
  }
}

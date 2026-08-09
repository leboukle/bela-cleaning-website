// SERVER-ONLY. Pure MIME message construction — deliberately hand-rolled
// rather than pulling in a mail-composition library (nodemailer's
// MailComposer, mimetext, etc.): the shape needed here (one plain-text
// part, one HTML part, no attachments) is small and stable enough that a
// dependency would add more weight than value. Every customer-controlled
// value (name, address, special instructions, ...) only ever appears in
// the BODY of a MIME part, after the blank line that separates headers
// from content — never concatenated into a header line — which is the
// primary defense against header injection (see emailSanitize.ts for the
// belt-and-suspenders second layer applied to header-bound values).
import "server-only";
import { randomBytes } from "node:crypto";
import { sanitizeHeaderValue } from "./emailSanitize";

export type MimeMessageInput = {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

// RFC 2047 "encoded-word" — required for any header value containing
// non-ASCII characters (this codebase's subject lines use an em dash).
// Applied unconditionally for simplicity and because it's always valid,
// not just when non-ASCII characters happen to be present.
function encodeHeaderText(value: string): string {
  const base64 = Buffer.from(sanitizeHeaderValue(value), "utf8").toString("base64");
  return `=?UTF-8?B?${base64}?=`;
}

function base64WrapLines(base64: string): string {
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += 76) {
    chunks.push(base64.slice(i, i + 76));
  }
  return chunks.join("\r\n");
}

function base64Part(contentType: string, body: string): string {
  const encoded = base64WrapLines(Buffer.from(body, "utf8").toString("base64"));
  return [`Content-Type: ${contentType}; charset="UTF-8"`, "Content-Transfer-Encoding: base64", "", encoded].join(
    "\r\n",
  );
}

/**
 * Builds a complete RFC 2822 multipart/alternative message (plain text +
 * HTML) and returns it base64url-encoded, ready for the Gmail API's
 * `users.messages.send` `raw` field.
 */
export function buildRawEmailMessage(input: MimeMessageInput): string {
  const boundary = `bela-${randomBytes(16).toString("hex")}`;
  const to = sanitizeHeaderValue(input.to);
  const from = sanitizeHeaderValue(input.from);
  const fromName = sanitizeHeaderValue(input.fromName);

  const headers = [
    `From: ${encodeHeaderText(fromName)} <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeHeaderText(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");

  const body = [
    "",
    `--${boundary}`,
    base64Part("text/plain", input.text),
    "",
    `--${boundary}`,
    base64Part("text/html", input.html),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const raw = `${headers}\r\n${body}`;
  return Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

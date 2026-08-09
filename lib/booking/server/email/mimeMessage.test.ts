import { describe, it, expect } from "vitest";
import { buildRawEmailMessage } from "./mimeMessage";

function decodeRaw(raw: string): string {
  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function decodeEncodedWord(headerValue: string): string {
  const match = /=\?UTF-8\?B\?(.+)\?=/.exec(headerValue);
  if (!match) return headerValue;
  return Buffer.from(match[1], "base64").toString("utf8");
}

describe("buildRawEmailMessage", () => {
  it("produces base64url output (no +, /, or = padding characters)", () => {
    const raw = buildRawEmailMessage({
      from: "sender@belacleaning.com",
      fromName: "BeLa Cleaning",
      to: "customer@example.com",
      subject: "Test subject",
      text: "plain text body",
      html: "<p>html body</p>",
    });
    expect(raw).not.toMatch(/[+/=]/);
  });

  it("includes correctly RFC-2047-encoded headers and both MIME parts", () => {
    const raw = buildRawEmailMessage({
      from: "sender@belacleaning.com",
      fromName: "BeLa Cleaning",
      to: "customer@example.com",
      subject: "BeLa Cleaning — Booking BELA-20260101-ABCDEF",
      text: "Thanks for booking!",
      html: "<p>Thanks for booking!</p>",
    });
    const decoded = decodeRaw(raw);

    expect(decoded).toContain("MIME-Version: 1.0");
    expect(decoded).toContain("Content-Type: multipart/alternative");
    expect(decoded).toContain("From: =?UTF-8?B?");
    expect(decoded).toContain("<sender@belacleaning.com>");
    expect(decoded).toContain("To: customer@example.com");

    const subjectHeaderMatch = /Subject: (=\?UTF-8\?B\?[^\r\n]+\?=)/.exec(decoded);
    expect(subjectHeaderMatch).not.toBeNull();
    expect(decodeEncodedWord(subjectHeaderMatch![1])).toBe("BeLa Cleaning — Booking BELA-20260101-ABCDEF");

    expect(decoded).toContain("Content-Type: text/plain");
    expect(decoded).toContain("Content-Type: text/html");

    // Body parts are base64 (Content-Transfer-Encoding: base64) — decode the
    // whole message a second time isn't meaningful, but we can confirm the
    // literal text made it into the base64-decoded raw message body when
    // re-decoded segment by segment.
    const plainPartMatch = /Content-Type: text\/plain[^]*?\r\n\r\n([\s\S]*?)\r\n--/.exec(decoded);
    expect(plainPartMatch).not.toBeNull();
    const plainDecoded = Buffer.from(plainPartMatch![1].replace(/\r\n/g, ""), "base64").toString("utf8");
    expect(plainDecoded).toBe("Thanks for booking!");
  });

  it("strips CRLF from a header-injection attempt in the recipient address", () => {
    const raw = buildRawEmailMessage({
      from: "sender@belacleaning.com",
      fromName: "BeLa Cleaning",
      to: "victim@example.com\r\nBcc: attacker@evil.example",
      subject: "Subject",
      text: "body",
      html: "<p>body</p>",
    });
    const decoded = decodeRaw(raw);
    const headerLines = decoded.split("\r\n\r\n")[0].split("\r\n");
    // The injection attempt must not become its own header line — it's
    // fine (expected, even) for the literal text to remain inside the
    // single "To:" line, since that's just harmless text at that point.
    expect(headerLines.some((line) => line.startsWith("Bcc:"))).toBe(false);
    const toLine = headerLines.find((line) => line.startsWith("To:"));
    expect(toLine).toBe("To: victim@example.com Bcc: attacker@evil.example");
  });
});

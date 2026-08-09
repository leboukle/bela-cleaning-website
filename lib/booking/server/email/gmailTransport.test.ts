import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./gmailAuth", () => ({
  getGmailAccessToken: vi.fn(),
  getGmailSenderEmail: vi.fn(),
}));

import { getGmailAccessToken, getGmailSenderEmail } from "./gmailAuth";
import { GmailApiTransport } from "./gmailTransport";

const mockedGetToken = vi.mocked(getGmailAccessToken);
const mockedGetSender = vi.mocked(getGmailSenderEmail);

beforeEach(() => {
  mockedGetToken.mockReset().mockResolvedValue("test-access-token");
  mockedGetSender.mockReset().mockReturnValue("bookings@belacleaning.com");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const MESSAGE = { to: "customer@example.com", subject: "Subject", text: "text body", html: "<p>html body</p>" };

describe("GmailApiTransport", () => {
  it("sends via the Gmail API with a bearer token and a base64url raw payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "msg-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const transport = new GmailApiTransport();
    const result = await transport.send(MESSAGE);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    const body = JSON.parse(init.body);
    expect(typeof body.raw).toBe("string");
    expect(body.raw).not.toMatch(/[+/=]/);
  });

  it("returns a failure result (without throwing) when the Gmail API responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const transport = new GmailApiTransport();
    const result = await transport.send(MESSAGE);
    expect(result.ok).toBe(false);
  });

  it("returns a failure result when authentication itself fails", async () => {
    mockedGetToken.mockRejectedValue(new Error("Missing required environment variable: GMAIL_OAUTH_CLIENT_ID"));
    const transport = new GmailApiTransport();
    const result = await transport.send(MESSAGE);
    expect(result.ok).toBe(false);
  });

  it("returns a failure result on a network error rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const transport = new GmailApiTransport();
    const result = await transport.send(MESSAGE);
    expect(result.ok).toBe(false);
  });
});

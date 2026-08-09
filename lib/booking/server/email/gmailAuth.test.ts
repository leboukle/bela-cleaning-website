import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getGmailAccessToken,
  getGmailSenderEmail,
  getInternalNotificationEmail,
  resetGmailAuthCacheForTests,
  GmailAuthConfigError,
} from "./gmailAuth";

const ENV_KEYS = [
  "GMAIL_OAUTH_CLIENT_ID",
  "GMAIL_OAUTH_CLIENT_SECRET",
  "GMAIL_OAUTH_REFRESH_TOKEN",
  "GMAIL_SENDER_EMAIL",
  "BELA_INTERNAL_NOTIFICATION_EMAIL",
] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  resetGmailAuthCacheForTests();
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.unstubAllGlobals();
});

function setValidCredentialEnv() {
  process.env.GMAIL_OAUTH_CLIENT_ID = "client-id";
  process.env.GMAIL_OAUTH_CLIENT_SECRET = "client-secret";
  process.env.GMAIL_OAUTH_REFRESH_TOKEN = "refresh-token";
}

describe("getGmailAccessToken", () => {
  it("throws GmailAuthConfigError when a required env var is missing", async () => {
    await expect(getGmailAccessToken()).rejects.toThrow(GmailAuthConfigError);
  });

  it("exchanges the refresh token for an access token via the OAuth endpoint", async () => {
    setValidCredentialEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "fresh-access-token", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await getGmailAccessToken();
    expect(token).toBe("fresh-access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
  });

  it("caches the access token and does not refetch until near expiry", async () => {
    setValidCredentialEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "cached-token", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getGmailAccessToken();
    await getGmailAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws GmailAuthConfigError when the token endpoint responds with an error status", async () => {
    setValidCredentialEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }));
    await expect(getGmailAccessToken()).rejects.toThrow(GmailAuthConfigError);
  });

  it("still throws GmailAuthConfigError cleanly when Google returns a structured OAuth error body", async () => {
    setValidCredentialEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        clone() {
          return this;
        },
        json: async () => ({ error: "invalid_client", error_description: "The OAuth client was not found." }),
      }),
    );
    await expect(getGmailAccessToken()).rejects.toThrow(GmailAuthConfigError);
  });

  it("throws GmailAuthConfigError when the response is missing an access token", async () => {
    setValidCredentialEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(getGmailAccessToken()).rejects.toThrow(GmailAuthConfigError);
  });
});

describe("getGmailSenderEmail / getInternalNotificationEmail", () => {
  it("throws when GMAIL_SENDER_EMAIL is missing", () => {
    expect(() => getGmailSenderEmail()).toThrow(GmailAuthConfigError);
  });

  it("returns the configured sender email", () => {
    process.env.GMAIL_SENDER_EMAIL = "bookings@belacleaning.com";
    expect(getGmailSenderEmail()).toBe("bookings@belacleaning.com");
  });

  it("throws when BELA_INTERNAL_NOTIFICATION_EMAIL is missing", () => {
    expect(() => getInternalNotificationEmail()).toThrow(GmailAuthConfigError);
  });

  it("returns the configured internal notification email", () => {
    process.env.BELA_INTERNAL_NOTIFICATION_EMAIL = "ops@belacleaning.com";
    expect(getInternalNotificationEmail()).toBe("ops@belacleaning.com");
  });
});

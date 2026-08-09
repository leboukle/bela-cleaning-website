// SERVER-ONLY. Gmail API authentication via a standard OAuth 2.0 refresh
// token — deliberately not a service-account JSON key. The refresh token
// was issued once, out of band, to a narrowly-scoped OAuth client
// (gmail.send only) authorized as the BeLa Workspace sending account; this
// module exchanges it for a short-lived access token on demand and never
// persists the access token beyond the current warm instance's memory.
//
//   GMAIL_OAUTH_REFRESH_TOKEN (long-lived, revocable, send-only scope)
//     -> exchanged at Google's OAuth token endpoint
//     -> short-lived Gmail API access token (~1 hour)
//     -> authorizes users.messages.send calls only
//
// This intentionally does not reuse googleAuth.ts's Workload Identity
// Federation client — WIF authenticates the app itself (via Vercel's OIDC
// identity) to impersonate a service account for Sheets; Gmail sending
// here authenticates as a real Workspace mailbox via a refresh token the
// account holder issued directly. Two different trust models, two
// different modules, matching the two different Google APIs in play.
import "server-only";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export class GmailAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthConfigError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new GmailAuthConfigError(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function getGmailSenderEmail(): string {
  return requireEnv("GMAIL_SENDER_EMAIL");
}

export function getInternalNotificationEmail(): string {
  return requireEnv("BELA_INTERNAL_NOTIFICATION_EMAIL");
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

// Refresh a little before the token's real expiry so a request never
// starts mid-flight with a token that expires before the call completes.
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

/**
 * Returns a valid Gmail API access token, refreshing it via the OAuth
 * token endpoint when the cached one is missing or near expiry. Never
 * logs the client secret, refresh token, or access token.
 */
export async function getGmailAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + EXPIRY_SAFETY_MARGIN_MS) {
    return cachedToken.accessToken;
  }

  const clientId = requireEnv("GMAIL_OAUTH_CLIENT_ID");
  const clientSecret = requireEnv("GMAIL_OAUTH_CLIENT_SECRET");
  const refreshToken = requireEnv("GMAIL_OAUTH_REFRESH_TOKEN");

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // Sanitized: status + Google's own short error code/description only
    // (e.g. "invalid_grant" / "Token has been expired or revoked") — never
    // the full response body, and never any of the credential values
    // themselves. Google's OAuth error responses do not echo back the
    // client secret or refresh token, only a short classification, so this
    // is safe to log the same way sheetsClient.ts logs Google's Sheets API
    // error status/message.
    let googleError = "";
    try {
      const errorBody = (await res.clone().json()) as { error?: string; error_description?: string };
      googleError = errorBody.error ? ` google_error=${errorBody.error} google_description=${errorBody.error_description}` : "";
    } catch {
      // Response wasn't JSON — nothing more to safely extract.
    }
    console.error(`[gmailAuth] Token refresh failed: status=${res.status}${googleError}`);
    throw new GmailAuthConfigError("Gmail API token refresh failed.");
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new GmailAuthConfigError("Gmail API token refresh did not return an access token.");
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.accessToken;
}

/** Test-only: clears the in-memory token cache between test cases. */
export function resetGmailAuthCacheForTests(): void {
  cachedToken = null;
}

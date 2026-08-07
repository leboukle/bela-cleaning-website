// SERVER-ONLY. Never import this file from a Client Component.
//
// Keyless Google authentication for the booking backend:
//
//   Vercel OIDC token (per-request, auto-rotated by the Vercel runtime)
//     -> exchanged at Google's Security Token Service for a short-lived
//        federated access token (Workload Identity Federation)
//     -> that federated token impersonates the BeLa Booking System
//        service account (service_account_impersonation_url)
//     -> the resulting access token authorizes calls to the Sheets API.
//
// There is no downloaded JSON key and no GOOGLE_PRIVATE_KEY anywhere in
// this flow — @vercel/oidc's getVercelOidcToken() supplies the subject
// token, and google-auth-library's IdentityPoolClient performs the STS
// exchange + impersonation. See docs/booking-backend.md for the full
// architecture diagram.
import "server-only";
import { IdentityPoolClient } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export class GoogleAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthConfigError";
  }
}

// Fails safely (throws, never falls back to a guessed value) when a
// required piece of configuration is missing — an incompletely-configured
// environment must never silently degrade into an insecure or broken
// booking path.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new GoogleAuthConfigError(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function getSpreadsheetId(): string {
  return requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
}

let cachedClient: IdentityPoolClient | null = null;

// Memoized per warm serverless instance. Constructing the client is cheap,
// but reusing one instance lets google-auth-library's own access-token
// cache (inside BaseExternalAccountClient) avoid a redundant STS exchange
// + impersonation round trip on every request within the same instance.
function getAuthClient(): IdentityPoolClient {
  if (cachedClient) return cachedClient;

  const projectNumber = requireEnv("GOOGLE_CLOUD_PROJECT_NUMBER");
  const poolId = requireEnv("GOOGLE_WORKLOAD_IDENTITY_POOL_ID");
  const providerId = requireEnv("GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID");
  const serviceAccountEmail = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");

  const audience = `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;

  cachedClient = new IdentityPoolClient({
    type: "external_account",
    audience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    token_url: "https://sts.googleapis.com/v1/token",
    scopes: [SHEETS_SCOPE],
    subject_token_supplier: {
      // Never cache or log the raw OIDC token — @vercel/oidc already
      // handles refresh, and google-auth-library caches the *exchanged*
      // GCP access token internally, so nothing further is needed here.
      getSubjectToken: async () => getVercelOidcToken(),
    },
  });

  return cachedClient;
}

/**
 * Returns a valid Google access token (federated + impersonated) for
 * calling the Sheets API. Never logs the token or any part of the
 * exchange response.
 */
export async function getGoogleAccessToken(): Promise<string> {
  const client = getAuthClient();
  const { token } = await client.getAccessToken();
  if (!token) {
    throw new GoogleAuthConfigError("Google Workload Identity Federation did not return an access token.");
  }
  return token;
}

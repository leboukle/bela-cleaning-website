// SERVER-ONLY. The one place that decides whether a request is an
// authenticated internal-admin request — either a valid session cookie
// (the browser UI's path, see adminSession.ts) or the raw
// x-internal-admin-secret header (kept for non-browser/internal callers,
// per the approved design — see internalAdminAuth.ts). The browser UI
// itself never sends the header; only the cookie, automatically, on
// same-origin requests.
import "server-only";
import { cookies } from "next/headers";
import { InternalAdminAuthError, verifyInternalAdminRequest } from "./internalAdminAuth";
import { ADMIN_SESSION_COOKIE_NAME, isValidAdminSessionToken } from "./adminSession";

/** Throws InternalAdminAuthError if neither a valid session cookie nor the header secret is present. */
export async function verifyInternalAdminAccess(request: Request): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (isValidAdminSessionToken(sessionToken)) return;

  verifyInternalAdminRequest(request.headers); // throws InternalAdminAuthError itself if this also fails
}

/** True/false version for a Server Component's own render-time check (the page never throws, it just chooses what to render). */
export async function hasValidAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

export { InternalAdminAuthError };

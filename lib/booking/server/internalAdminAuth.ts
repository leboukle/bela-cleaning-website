// SERVER-ONLY. Authenticates BeLa's own internal cleaner-assignment
// actions (create an assignment, mark a booking complete) — deliberately
// a SEPARATE secret from PAYMENT_SCHEDULER_SECRET (schedulerAuth.ts),
// since that one authenticates the machine-to-machine Apps Script
// scheduler while this one authenticates BeLa's own manual, human-
// triggered actions. Keeping them independently rotatable means a leak of
// one can never be used to forge the other. Mirrors schedulerAuth.ts's
// header-based, constant-time-compare shape exactly.
import "server-only";
import { timingSafeEqual } from "node:crypto";

const INTERNAL_ADMIN_SECRET_HEADER = "x-internal-admin-secret";

export class InternalAdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InternalAdminAuthError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new InternalAdminAuthError(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function getInternalAdminSecret(): string {
  return requireEnv("INTERNAL_ADMIN_SECRET");
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Throws InternalAdminAuthError if the request's shared-secret header is missing or wrong. */
export function verifyInternalAdminRequest(headers: Headers): void {
  const provided = headers.get(INTERNAL_ADMIN_SECRET_HEADER);
  if (!provided) {
    throw new InternalAdminAuthError(`Missing ${INTERNAL_ADMIN_SECRET_HEADER} header.`);
  }

  const expected = getInternalAdminSecret();
  if (!constantTimeEquals(provided, expected)) {
    throw new InternalAdminAuthError("Internal admin secret does not match.");
  }
}

/**
 * Constant-time comparison against the raw secret value — used only by
 * the login form's own POST handler (/api/internal/session) to validate
 * the access code a human just typed in, before minting a session cookie
 * (see adminSession.ts). The raw secret is never itself put in a URL,
 * cookie, or any client-visible state; this function is the one place it
 * is ever compared directly.
 */
export function adminSecretMatches(candidate: string): boolean {
  try {
    return constantTimeEquals(candidate, getInternalAdminSecret());
  } catch {
    return false;
  }
}

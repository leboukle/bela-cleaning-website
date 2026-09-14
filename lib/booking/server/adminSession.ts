// SERVER-ONLY. Stateless, short-lived admin session tokens for the
// internal cleaner-assignment tool. Deliberately NOT a database-backed
// session (no session table, no per-user identity — there is exactly one
// shared operational secret, see internalAdminAuth.ts) — a token is
// `<expiryEpochMs>.<hmacHex>`, where the HMAC is keyed by
// INTERNAL_ADMIN_SECRET itself. Verifying only requires recomputing that
// HMAC and checking the expiry, so any warm serverless instance can
// verify a token with no shared state. Even if a token leaks, it reveals
// nothing about the underlying secret (HMAC is one-way) and stops working
// the moment it expires.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getInternalAdminSecret } from "./internalAdminAuth";

export const ADMIN_SESSION_COOKIE_NAME = "bela_internal_admin_session";
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — one operational shift

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Mints a fresh session token, valid for ADMIN_SESSION_TTL_MS from `now`. */
export function createAdminSessionToken(now: Date = new Date()): string {
  const expiresAt = now.getTime() + ADMIN_SESSION_TTL_MS;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload, getInternalAdminSecret())}`;
}

/**
 * True only for a token that (a) is well-formed, (b) has not expired, and
 * (c) carries a valid HMAC signature under the current INTERNAL_ADMIN_SECRET
 * — so rotating that secret also immediately invalidates every
 * outstanding session, with no separate revocation list needed.
 */
export function isValidAdminSessionToken(token: string | undefined | null, now: Date = new Date()): boolean {
  if (!token) return false;
  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) return false;

  const payload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  if (!payload || !signature) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return false;

  let expectedSignature: string;
  try {
    expectedSignature = sign(payload, getInternalAdminSecret());
  } catch {
    return false;
  }

  const provided = Buffer.from(signature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

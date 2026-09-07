// SERVER-ONLY. Manage Booking token generation, hashing, and verification.
//
// Security model (see docs/manage-booking.md for the full writeup): the
// raw token is a 256-bit cryptographically random value, minted once at
// booking-creation time and put in the confirmation email's link. Only its
// SHA-256 hash is ever stored (in the "Manage Booking Token Hash" column)
// — the raw value never touches the Sheet, so even full Sheet access
// never yields a usable link. The tradeoff: lookups can't be indexed by
// token, only by scanning the hash column (same bounded-scan cost class
// already accepted for idempotency-token and notification-status
// lookups elsewhere in this codebase).
import "server-only";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { businessConfig } from "@/lib/config";

const TOKEN_BYTES = 32; // 256 bits of entropy

/** A fresh, high-entropy, URL-safe manage-booking token. Never persisted in this form. */
export function generateManageToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** SHA-256 hex digest of a token — this is the only form ever written to the Sheet. */
export function hashManageToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of two hex hash strings, mirroring schedulerAuth.ts's pattern. */
export function manageTokenHashesMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

// A cheap shape check only — real verification is always the hash lookup
// against the Sheet. Rejects obviously-malformed input (wrong length,
// disallowed characters) before doing any Sheets I/O; base64url tokens
// from generateManageToken() are 43 characters, but this stays generous
// in case the encoding ever changes.
const TOKEN_SHAPE_REGEX = /^[A-Za-z0-9_-]{20,80}$/;

export function isPlausibleManageToken(token: string): boolean {
  return TOKEN_SHAPE_REGEX.test(token);
}

/** The full, absolute Manage Booking URL for a raw token — used in every email/UI surface. */
export function buildManageBookingUrl(token: string): string {
  return `${businessConfig.websiteUrl}/manage-booking/${token}`;
}

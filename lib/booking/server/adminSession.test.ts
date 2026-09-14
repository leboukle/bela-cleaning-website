import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAdminSessionToken, isValidAdminSessionToken, ADMIN_SESSION_TTL_MS } from "./adminSession";

const originalEnv = { INTERNAL_ADMIN_SECRET: process.env.INTERNAL_ADMIN_SECRET };

beforeEach(() => {
  process.env.INTERNAL_ADMIN_SECRET = "correct-admin-secret";
});

afterEach(() => {
  if (originalEnv.INTERNAL_ADMIN_SECRET === undefined) delete process.env.INTERNAL_ADMIN_SECRET;
  else process.env.INTERNAL_ADMIN_SECRET = originalEnv.INTERNAL_ADMIN_SECRET;
});

const NOW = new Date("2026-02-01T12:00:00.000Z");

describe("createAdminSessionToken / isValidAdminSessionToken", () => {
  it("a freshly created token is valid immediately", () => {
    const token = createAdminSessionToken(NOW);
    expect(isValidAdminSessionToken(token, NOW)).toBe(true);
  });

  it("a token is still valid just before its TTL elapses", () => {
    const token = createAdminSessionToken(NOW);
    const justBefore = new Date(NOW.getTime() + ADMIN_SESSION_TTL_MS - 1000);
    expect(isValidAdminSessionToken(token, justBefore)).toBe(true);
  });

  it("a token expires at its TTL boundary", () => {
    const token = createAdminSessionToken(NOW);
    const atExpiry = new Date(NOW.getTime() + ADMIN_SESSION_TTL_MS);
    expect(isValidAdminSessionToken(token, atExpiry)).toBe(false);
  });

  it("a token is rejected well after expiry", () => {
    const token = createAdminSessionToken(NOW);
    const wayLater = new Date(NOW.getTime() + ADMIN_SESSION_TTL_MS * 10);
    expect(isValidAdminSessionToken(token, wayLater)).toBe(false);
  });

  it("rejects a missing token", () => {
    expect(isValidAdminSessionToken(undefined, NOW)).toBe(false);
    expect(isValidAdminSessionToken(null, NOW)).toBe(false);
    expect(isValidAdminSessionToken("", NOW)).toBe(false);
  });

  it("rejects a malformed token with no separator", () => {
    expect(isValidAdminSessionToken("not-a-real-token", NOW)).toBe(false);
  });

  it("rejects a token with a tampered expiry (signature no longer matches)", () => {
    const token = createAdminSessionToken(NOW);
    const [, signature] = token.split(".");
    const tamperedExpiry = String(NOW.getTime() + 999 * ADMIN_SESSION_TTL_MS); // pushes expiry far into the future
    const tampered = `${tamperedExpiry}.${signature}`;
    expect(isValidAdminSessionToken(tampered, NOW)).toBe(false);
  });

  it("rejects a token with a tampered/garbage signature", () => {
    const token = createAdminSessionToken(NOW);
    const [payload] = token.split(".");
    expect(isValidAdminSessionToken(`${payload}.0000000000000000000000000000000000000000000000000000000000000000`, NOW)).toBe(false);
  });

  it("rejects a token signed under a different (now-rotated) secret", () => {
    const token = createAdminSessionToken(NOW);
    process.env.INTERNAL_ADMIN_SECRET = "a-newly-rotated-secret";
    expect(isValidAdminSessionToken(token, NOW)).toBe(false);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyInternalAdminRequest, adminSecretMatches, getInternalAdminSecret, InternalAdminAuthError } from "./internalAdminAuth";

const originalEnv = { INTERNAL_ADMIN_SECRET: process.env.INTERNAL_ADMIN_SECRET };

beforeEach(() => {
  process.env.INTERNAL_ADMIN_SECRET = "correct-admin-secret";
});

afterEach(() => {
  if (originalEnv.INTERNAL_ADMIN_SECRET === undefined) delete process.env.INTERNAL_ADMIN_SECRET;
  else process.env.INTERNAL_ADMIN_SECRET = originalEnv.INTERNAL_ADMIN_SECRET;
});

describe("verifyInternalAdminRequest", () => {
  it("passes when the header exactly matches the configured secret", () => {
    const headers = new Headers({ "x-internal-admin-secret": "correct-admin-secret" });
    expect(() => verifyInternalAdminRequest(headers)).not.toThrow();
  });

  it("throws InternalAdminAuthError when the header is missing entirely", () => {
    const headers = new Headers();
    expect(() => verifyInternalAdminRequest(headers)).toThrow(InternalAdminAuthError);
  });

  it("throws InternalAdminAuthError when the header value doesn't match", () => {
    const headers = new Headers({ "x-internal-admin-secret": "wrong-value" });
    expect(() => verifyInternalAdminRequest(headers)).toThrow(InternalAdminAuthError);
  });

  it("throws InternalAdminAuthError when the env var itself is missing", () => {
    delete process.env.INTERNAL_ADMIN_SECRET;
    const headers = new Headers({ "x-internal-admin-secret": "anything" });
    expect(() => verifyInternalAdminRequest(headers)).toThrow(InternalAdminAuthError);
  });
});

describe("getInternalAdminSecret", () => {
  it("is a distinct secret from PAYMENT_SCHEDULER_SECRET — never rejects a request lacking that header as if it were this one", () => {
    // Documents the architectural decision (independently rotatable
    // credentials) rather than testing implementation details: this
    // module reads its own env var, never PAYMENT_SCHEDULER_SECRET.
    expect(getInternalAdminSecret()).toBe("correct-admin-secret");
  });
});

describe("adminSecretMatches", () => {
  it("returns true for the exact configured secret", () => {
    expect(adminSecretMatches("correct-admin-secret")).toBe(true);
  });

  it("returns false for a wrong value", () => {
    expect(adminSecretMatches("wrong-value")).toBe(false);
  });

  it("returns false (not throw) when the env var is missing — used by a page render, which must never crash on a bad URL", () => {
    delete process.env.INTERNAL_ADMIN_SECRET;
    expect(adminSecretMatches("anything")).toBe(false);
  });
});

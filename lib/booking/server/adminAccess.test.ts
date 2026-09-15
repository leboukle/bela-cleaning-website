import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { cookies } from "next/headers";
import { verifyInternalAdminAccess, hasValidAdminSession, InternalAdminAuthError } from "./adminAccess";
import { createAdminSessionToken, ADMIN_SESSION_COOKIE_NAME } from "./adminSession";

const mockedCookies = vi.mocked(cookies);
const originalEnv = { INTERNAL_ADMIN_SECRET: process.env.INTERNAL_ADMIN_SECRET };

beforeEach(() => {
  process.env.INTERNAL_ADMIN_SECRET = "correct-admin-secret";
});

afterEach(() => {
  if (originalEnv.INTERNAL_ADMIN_SECRET === undefined) delete process.env.INTERNAL_ADMIN_SECRET;
  else process.env.INTERNAL_ADMIN_SECRET = originalEnv.INTERNAL_ADMIN_SECRET;
});

function cookieJarWith(value: string | undefined) {
  return {
    get: (name: string) => (name === ADMIN_SESSION_COOKIE_NAME && value !== undefined ? { name, value } : undefined),
  };
}

function fakeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://internal.example.com/api/internal/cleaner-assignments", { headers });
}

describe("verifyInternalAdminAccess", () => {
  it("passes with a valid session cookie, no header needed", async () => {
    mockedCookies.mockResolvedValue(cookieJarWith(createAdminSessionToken()) as never);
    await expect(verifyInternalAdminAccess(fakeRequest())).resolves.not.toThrow();
  });

  it("falls back to the x-internal-admin-secret header when there is no cookie", async () => {
    mockedCookies.mockResolvedValue(cookieJarWith(undefined) as never);
    await expect(verifyInternalAdminAccess(fakeRequest({ "x-internal-admin-secret": "correct-admin-secret" }))).resolves.not.toThrow();
  });

  it("throws when neither a valid cookie nor a valid header is present", async () => {
    mockedCookies.mockResolvedValue(cookieJarWith(undefined) as never);
    await expect(verifyInternalAdminAccess(fakeRequest())).rejects.toThrow(InternalAdminAuthError);
  });

  it("throws when the cookie is present but expired/invalid and no header is given", async () => {
    mockedCookies.mockResolvedValue(cookieJarWith("garbage.notarealsignature") as never);
    await expect(verifyInternalAdminAccess(fakeRequest())).rejects.toThrow(InternalAdminAuthError);
  });

  it("throws when the header secret is wrong", async () => {
    mockedCookies.mockResolvedValue(cookieJarWith(undefined) as never);
    await expect(verifyInternalAdminAccess(fakeRequest({ "x-internal-admin-secret": "wrong" }))).rejects.toThrow(InternalAdminAuthError);
  });
});

describe("hasValidAdminSession", () => {
  it("returns true for a valid session cookie", async () => {
    mockedCookies.mockResolvedValue(cookieJarWith(createAdminSessionToken()) as never);
    expect(await hasValidAdminSession()).toBe(true);
  });

  it("returns false (never throws) when there is no cookie at all", async () => {
    mockedCookies.mockResolvedValue(cookieJarWith(undefined) as never);
    expect(await hasValidAdminSession()).toBe(false);
  });

  it("returns false for an expired session", async () => {
    const longAgo = new Date("2020-01-01T00:00:00.000Z");
    mockedCookies.mockResolvedValue(cookieJarWith(createAdminSessionToken(longAgo)) as never);
    expect(await hasValidAdminSession()).toBe(false);
  });
});

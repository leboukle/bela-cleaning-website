import { describe, it, expect, afterEach } from "vitest";
import { generateManageToken, hashManageToken, manageTokenHashesMatch, isPlausibleManageToken, buildManageBookingUrl } from "./manageToken";

describe("generateManageToken", () => {
  it("produces a high-entropy, URL-safe token with no padding characters", () => {
    const token = generateManageToken();
    expect(token.length).toBeGreaterThanOrEqual(40); // 256 bits base64url-encoded, no padding
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats across calls", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateManageToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("hashManageToken", () => {
  it("is deterministic for the same input", () => {
    const token = generateManageToken();
    expect(hashManageToken(token)).toBe(hashManageToken(token));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashManageToken("token-a")).not.toBe(hashManageToken("token-b"));
  });

  it("produces a 64-character hex digest (SHA-256)", () => {
    expect(hashManageToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never reveals the raw token in its output", () => {
    const token = "super-secret-raw-token-value";
    expect(hashManageToken(token)).not.toContain(token);
  });
});

describe("manageTokenHashesMatch", () => {
  it("returns true for identical hashes", () => {
    const hash = hashManageToken("token");
    expect(manageTokenHashesMatch(hash, hash)).toBe(true);
  });

  it("returns false for different hashes", () => {
    expect(manageTokenHashesMatch(hashManageToken("a"), hashManageToken("b"))).toBe(false);
  });

  it("returns false (not throws) for malformed/short input rather than crashing", () => {
    expect(manageTokenHashesMatch("", hashManageToken("token"))).toBe(false);
    expect(manageTokenHashesMatch("not-hex-!!", hashManageToken("token"))).toBe(false);
  });
});

describe("isPlausibleManageToken", () => {
  it("accepts a real generated token", () => {
    expect(isPlausibleManageToken(generateManageToken())).toBe(true);
  });

  it("rejects obviously malformed input", () => {
    expect(isPlausibleManageToken("")).toBe(false);
    expect(isPlausibleManageToken("short")).toBe(false);
    expect(isPlausibleManageToken("has spaces in it and is long enough")).toBe(false);
    expect(isPlausibleManageToken("<script>alert(1)</script>")).toBe(false);
  });
});

describe("buildManageBookingUrl", () => {
  const ORIGINAL_ENV = process.env.MANAGE_BOOKING_BASE_URL;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.MANAGE_BOOKING_BASE_URL;
    else process.env.MANAGE_BOOKING_BASE_URL = ORIGINAL_ENV;
  });

  it("builds an absolute URL containing the raw token", () => {
    const url = buildManageBookingUrl("abc123");
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain("/manage-booking/abc123");
  });

  it("falls back to the Production URL when MANAGE_BOOKING_BASE_URL is unset", () => {
    delete process.env.MANAGE_BOOKING_BASE_URL;
    expect(buildManageBookingUrl("abc123")).toBe("https://www.belacleaning.com/manage-booking/abc123");
  });

  it("falls back to the Production URL when MANAGE_BOOKING_BASE_URL is blank", () => {
    process.env.MANAGE_BOOKING_BASE_URL = "   ";
    expect(buildManageBookingUrl("abc123")).toBe("https://www.belacleaning.com/manage-booking/abc123");
  });

  it("uses MANAGE_BOOKING_BASE_URL when set (Preview)", () => {
    process.env.MANAGE_BOOKING_BASE_URL = "https://bela-payments-preview.vercel.app";
    expect(buildManageBookingUrl("abc123")).toBe("https://bela-payments-preview.vercel.app/manage-booking/abc123");
  });

  it("strips a trailing slash from MANAGE_BOOKING_BASE_URL", () => {
    process.env.MANAGE_BOOKING_BASE_URL = "https://bela-payments-preview.vercel.app/";
    expect(buildManageBookingUrl("abc123")).toBe("https://bela-payments-preview.vercel.app/manage-booking/abc123");
  });
});

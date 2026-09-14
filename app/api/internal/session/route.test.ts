// Deliberately a dedicated test for a route.ts file (this codebase's
// usual convention is "routes are thin plumbing, test the service layer
// instead") — but this route's correctness IS its HTTP response shape
// (which cookie attributes get set), which only calling the handler
// directly can verify. A missed `httpOnly`/`secure`/`sameSite` flag here
// would be a real vulnerability nothing else in the suite would catch.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST, DELETE } from "./route";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/booking/server/adminSession";
import { resetRateLimitForTests } from "@/lib/booking/server/rateLimit";

const originalEnv = { INTERNAL_ADMIN_SECRET: process.env.INTERNAL_ADMIN_SECRET, NODE_ENV: process.env.NODE_ENV };

beforeEach(() => {
  process.env.INTERNAL_ADMIN_SECRET = "correct-admin-secret";
  resetRateLimitForTests();
});

afterEach(() => {
  if (originalEnv.INTERNAL_ADMIN_SECRET === undefined) delete process.env.INTERNAL_ADMIN_SECRET;
  else process.env.INTERNAL_ADMIN_SECRET = originalEnv.INTERNAL_ADMIN_SECRET;
  vi.stubEnv("NODE_ENV", originalEnv.NODE_ENV ?? "test");
});

function loginRequest(secret: unknown): Request {
  return new Request("https://internal.example.com/api/internal/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `${Math.random()}` },
    body: JSON.stringify({ secret }),
  });
}

describe("POST /api/internal/session (login)", () => {
  it("sets an HttpOnly, SameSite=Strict session cookie on the correct secret", async () => {
    const response = await POST(loginRequest("correct-admin-secret"));
    const body = await response.json();
    expect(body.ok).toBe(true);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=strict");
  });

  it("marks the cookie Secure in a production-like environment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(loginRequest("correct-admin-secret"));
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("Secure");
  });

  it("never echoes the raw secret back in the response body", async () => {
    const response = await POST(loginRequest("correct-admin-secret"));
    const raw = JSON.stringify(await response.json());
    expect(raw).not.toContain("correct-admin-secret");
  });

  it("rejects an incorrect secret and sets no cookie", async () => {
    const response = await POST(loginRequest("wrong-secret"));
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a missing secret", async () => {
    const response = await POST(loginRequest(undefined));
    expect(response.status).toBe(401);
  });

  it("rejects a non-JSON body without crashing", async () => {
    const request = new Request("https://internal.example.com/api/internal/session", {
      method: "POST",
      headers: { "x-forwarded-for": `${Math.random()}` },
      body: "not json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/internal/session (logout)", () => {
  it("clears the session cookie", async () => {
    const response = await DELETE();
    const body = await response.json();
    expect(body.ok).toBe(true);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE_NAME}=`);
    // An emptied, immediately-expired cookie — browsers only ever
    // interpret this as "delete."
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});

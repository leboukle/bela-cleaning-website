// SERVER-ONLY API route. The internal admin tool's login/logout. POST
// validates a submitted access code against INTERNAL_ADMIN_SECRET
// (timing-safe, see internalAdminAuth.ts's adminSecretMatches) and, on
// success, sets an HttpOnly/Secure/SameSite=Strict session cookie — the
// raw secret itself is never echoed back, never put in the response body,
// and never touches the URL. DELETE clears that cookie. Rate-limited like
// every other public-facing POST in this app.
import { NextResponse } from "next/server";
import { adminSecretMatches } from "@/lib/booking/server/internalAdminAuth";
import { createAdminSessionToken, ADMIN_SESSION_COOKIE_NAME, ADMIN_SESSION_TTL_MS } from "@/lib/booking/server/adminSession";
import { isRateLimited } from "@/lib/booking/server/rateLimit";

export const runtime = "nodejs";

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  return `internal-admin-session:${ip}`;
}

// Cookies are Secure (HTTPS-only) on every real deployment. Vercel sets
// NODE_ENV=production for both Preview and Production builds — only
// local `next dev` is "development" — so this is true everywhere except
// local HTTP testing, where a Secure cookie would otherwise never be set
// by the browser at all.
function isSecureEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

type LoginRequestBody = { secret?: unknown };

export async function POST(request: Request) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ ok: false, message: "Too many attempts. Please wait a moment and try again." }, { status: 429 });
  }

  let body: LoginRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!secret || !adminSecretMatches(secret)) {
    return NextResponse.json({ ok: false, message: "Incorrect access code." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, createAdminSessionToken(), {
    httpOnly: true,
    secure: isSecureEnvironment(),
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: isSecureEnvironment(),
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}

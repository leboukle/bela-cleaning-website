// SERVER-ONLY API route. Resolves a Manage Booking token to the
// customer-safe booking view — all token validation, authorization, and
// field whitelisting happens in manageBookingAccess.ts/manageBookingView.ts;
// this file is HTTP plumbing only. Never exposes internal identifiers in
// its error responses (a generic "not found" for any invalid/expired/
// unrecognized token, indistinguishable from a token that never existed).
import { NextResponse } from "next/server";
import { getManageBookingView } from "@/lib/booking/server/manageBookingAccess";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { NotificationService } from "@/lib/booking/server/notificationService";
import { GmailApiTransport } from "@/lib/booking/server/email/gmailTransport";
import { isRateLimited } from "@/lib/booking/server/rateLimit";

export const runtime = "nodejs";

const repository = new GoogleSheetsBookingRepository();
const notificationService = new NotificationService(new GmailApiTransport());

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  return `manage-booking:${ip}`;
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait a moment and try again." }, { status: 429 });
  }

  const { token } = await context.params;

  try {
    const result = await getManageBookingView(token, repository, notificationService);
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: "This booking link is invalid or has expired." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, booking: result.view });
  } catch (error) {
    console.error("[api/manage-booking] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to load this booking right now." }, { status: 500 });
  }
}

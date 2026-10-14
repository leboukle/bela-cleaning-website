// SERVER-ONLY API route. Read-only: tells the booking page whether the
// follow-up link a customer arrived with qualifies for the recurring
// discount, so the quote they see matches what bookingService.ts will
// authoritatively price. It reveals only a boolean (and a coarse reason)
// to someone already holding the secret token — no booking details, no
// PII — and it grants nothing: the submission re-resolves eligibility
// itself and never trusts this answer.
import { NextResponse } from "next/server";
import { resolveFollowUpEligibility } from "@/lib/booking/server/followUpEligibility";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { isRateLimited } from "@/lib/booking/server/rateLimit";

export const runtime = "nodejs";

const repository = new GoogleSheetsBookingRepository();

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  return `follow-up-eligibility:${ip}`;
}

export async function GET(request: Request) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait a moment and try again." }, { status: 429 });
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";

  try {
    const result = await resolveFollowUpEligibility(token, repository);
    if (result.eligible) return NextResponse.json({ ok: true, eligible: true });
    // Collapse the internal reasons to what the customer can act on.
    const reason = result.reason === "first-cleaning-not-completed" ? "first-cleaning-not-completed" : "not-eligible";
    return NextResponse.json({ ok: true, eligible: false, reason });
  } catch (error) {
    console.error("[api/booking/follow-up-eligibility] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to check this right now." }, { status: 500 });
  }
}

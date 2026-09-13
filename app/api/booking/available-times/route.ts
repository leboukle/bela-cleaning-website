// SERVER-ONLY API route. Milestone 6 amendment: returns the exact
// appointment start times BeLa can currently offer for a given date and
// estimated duration — operating-hours/duration-filtered and
// overlap/capacity-checked against live Sheets data (see
// availability.ts's getAvailableStartTimes). Never exposes booking counts
// or any customer detail, only start-time strings — mirrors
// /api/booking/availability's same privacy stance for date-level
// availability.
import { NextResponse } from "next/server";
import { getAvailableStartTimes } from "@/lib/booking/server/availability";
import { isValidDateKey } from "@/lib/booking/server/dateUtils";
import { isRateLimited } from "@/lib/booking/server/rateLimit";

export const runtime = "nodejs";

// Sanity bound — well above any real estimated duration, guards only
// against an abusive/malformed request.
const MAX_DURATION_MINUTES = 24 * 60;

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  return `available-times:${ip}`;
}

export async function GET(request: Request) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait a moment and try again." }, { status: 429 });
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date") ?? "";
  const durationParam = Number(url.searchParams.get("durationMinutes"));

  if (!isValidDateKey(dateParam)) {
    return NextResponse.json({ ok: false, message: "A valid date is required." }, { status: 422 });
  }
  if (!Number.isFinite(durationParam) || durationParam <= 0 || durationParam > MAX_DURATION_MINUTES) {
    return NextResponse.json({ ok: false, message: "A valid estimated duration is required." }, { status: 422 });
  }

  try {
    const availableStartTimes = await getAvailableStartTimes(dateParam, durationParam);
    return NextResponse.json({ ok: true, availableStartTimes });
  } catch (error) {
    console.error("[api/booking/available-times] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to load available times right now." }, { status: 500 });
  }
}

// SERVER-ONLY API route. Returns the set of unavailable date keys (blackout
// or at/over capacity) within a bounded window, so the client calendar can
// disable real dates instead of the previous milestone's mock list. Never
// exposes booking counts or any customer detail — only date keys.
import { NextResponse } from "next/server";
import { getUnavailableDateKeysInWindow } from "@/lib/booking/server/availability";
import { isValidDateKey } from "@/lib/booking/server/dateUtils";
import { getMaxSelectableDate, getMinSelectableDate, toDateKey } from "@/lib/booking/schedule";
import { isRateLimited } from "@/lib/booking/server/rateLimit";

export const runtime = "nodejs";

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  return `availability:${ip}`;
}

export async function GET(request: Request) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait a moment and try again." }, { status: 429 });
  }

  const url = new URL(request.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");

  const bookableMinKey = toDateKey(getMinSelectableDate());
  const bookableMaxKey = toDateKey(getMaxSelectableDate());

  const requestedStart = startParam && isValidDateKey(startParam) ? startParam : bookableMinKey;
  const requestedEnd = endParam && isValidDateKey(endParam) ? endParam : bookableMaxKey;

  // Clamp to the actual bookable window regardless of what was requested —
  // this endpoint must never be usable to probe capacity data outside the
  // range a customer could ever actually select.
  const startDateKey = requestedStart < bookableMinKey ? bookableMinKey : requestedStart;
  const endDateKey = requestedEnd > bookableMaxKey ? bookableMaxKey : requestedEnd;

  if (startDateKey > endDateKey) {
    return NextResponse.json({ ok: true, unavailableDateKeys: [] });
  }

  try {
    const unavailableDateKeys = await getUnavailableDateKeysInWindow(startDateKey, endDateKey);
    return NextResponse.json({ ok: true, unavailableDateKeys });
  } catch (error) {
    console.error("[api/booking/availability] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to load availability right now." }, { status: 500 });
  }
}

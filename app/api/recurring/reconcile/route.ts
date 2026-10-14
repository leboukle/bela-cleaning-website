// SERVER-ONLY API route. Called only by the Google Apps Script recurring
// scheduler (see apps-script/recurringScheduler.gs) on a time-driven
// trigger. Apps Script proposes which schedule IDs to look at by reading
// the Recurring Schedules sheet (and any recurring initial appointment that
// has no schedule row yet); this route re-reads everything itself and
// never trusts anything the caller asserts — see
// recurringScheduleService.reconcileSchedule. Authenticated with the same
// shared-secret header as the payment and reminder schedulers.
import { NextResponse } from "next/server";
import { verifySchedulerRequest, SchedulerAuthError } from "@/lib/booking/server/schedulerAuth";
import { reconcileSchedule } from "@/lib/booking/server/recurringScheduleService";
import { getRecurringDeps } from "@/lib/booking/server/recurringRuntime";

export const runtime = "nodejs";

const MAX_SCHEDULE_IDS_PER_REQUEST = 100;
const MAX_BODY_BYTES = 20_000;

export async function POST(request: Request) {
  try {
    verifySchedulerRequest(request.headers);
  } catch (error) {
    if (error instanceof SchedulerAuthError) {
      return NextResponse.json({ ok: false, code: "unauthorized", message: "Invalid or missing scheduler credentials." }, { status: 401 });
    }
    throw error;
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, code: "payload-too-large", message: "Request body is too large." }, { status: 413 });
  }

  let body: { scheduleIds?: unknown };
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ ok: false, code: "invalid-json", message: "Invalid request body." }, { status: 400 });
  }

  const scheduleIds = body.scheduleIds;
  if (!Array.isArray(scheduleIds) || scheduleIds.some((id) => typeof id !== "string" || id.length === 0 || id.length > 64)) {
    return NextResponse.json({ ok: false, code: "validation", message: "scheduleIds must be an array of strings." }, { status: 422 });
  }
  if (scheduleIds.length > MAX_SCHEDULE_IDS_PER_REQUEST) {
    return NextResponse.json(
      { ok: false, code: "validation", message: `No more than ${MAX_SCHEDULE_IDS_PER_REQUEST} schedule IDs per request.` },
      { status: 422 },
    );
  }

  const deps = getRecurringDeps();
  const now = new Date();
  const results = [];
  // Sequential on purpose: one schedule's read-then-write sequence is never
  // interleaved with another's, and Sheets quota stays comfortable.
  for (const scheduleId of scheduleIds as string[]) {
    try {
      results.push(await reconcileSchedule(scheduleId, deps, now));
    } catch (error) {
      console.error(`[api/recurring/reconcile] unhandled error: scheduleId=${scheduleId}`, error instanceof Error ? error.message : "unknown error");
      results.push({ scheduleId, outcome: "error" as const });
    }
  }
  return NextResponse.json({ ok: true, results }, { status: 200 });
}

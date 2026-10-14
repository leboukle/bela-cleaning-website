// SERVER-ONLY API route behind the owner's "Run recurring check now" button:
// runs the same idempotent reconciliation the 30-minute Apps Script trigger
// runs, for every Active or Paused schedule, on demand. Safe to press any
// number of times — it can create at most the one appointment that is due.
import { NextResponse } from "next/server";
import { verifyInternalAdminAccess, InternalAdminAuthError } from "@/lib/booking/server/adminAccess";
import { reconcileSchedule } from "@/lib/booking/server/recurringScheduleService";
import { getRecurringDeps, getRecurringScheduleRepository } from "@/lib/booking/server/recurringRuntime";
import { SCHEDULE_STATUS } from "@/lib/booking/server/recurringScheduleSchema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await verifyInternalAdminAccess(request);
  } catch (error) {
    if (error instanceof InternalAdminAuthError) {
      return NextResponse.json({ ok: false, message: "Invalid or missing internal admin credentials." }, { status: 401 });
    }
    throw error;
  }

  try {
    const ids = await getRecurringScheduleRepository().listScheduleIds([SCHEDULE_STATUS.ACTIVE, SCHEDULE_STATUS.PAUSED]);
    const deps = getRecurringDeps();
    const now = new Date();
    let created = 0;
    let needsReview = 0;
    let unchanged = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        const result = await reconcileSchedule(id, deps, now);
        const outcome = result.generation && "outcome" in result.generation ? result.generation.outcome : "";
        if (outcome === "created") created += 1;
        else if (outcome === "needs-review" || outcome === "paused") needsReview += 1;
        else unchanged += 1;
      } catch (error) {
        failed += 1;
        console.error(`[api/internal/recurring-schedules/reconcile-all] ${id}:`, error instanceof Error ? error.message : "unknown error");
      }
    }
    const message = `Checked ${ids.length} schedule(s): ${created} new appointment(s) created, ${needsReview} need your review, ${unchanged} unchanged${failed ? `, ${failed} failed (see logs)` : ""}.`;
    return NextResponse.json({ ok: failed === 0, checked: ids.length, created, needsReview, unchanged, failed, message }, { status: 200 });
  } catch (error) {
    console.error("[api/internal/recurring-schedules/reconcile-all] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to run the check right now." }, { status: 500 });
  }
}

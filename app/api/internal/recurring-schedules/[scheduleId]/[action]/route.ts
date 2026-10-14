// SERVER-ONLY API route. BeLa's owner actions on a recurring schedule:
//   POST /api/internal/recurring-schedules/<scheduleId>/skip-occurrence
//   POST /api/internal/recurring-schedules/<scheduleId>/resume
//   POST /api/internal/recurring-schedules/<scheduleId>/end
// Same session-cookie-or-header gate as every other internal route (see
// adminAccess.ts). Every action resolves through the same creation path as
// automatic generation — there is no separate way to create an appointment.
import { NextResponse } from "next/server";
import { verifyInternalAdminAccess, InternalAdminAuthError } from "@/lib/booking/server/adminAccess";
import { endScheduleByOwner, resumeSchedule, skipNextOccurrence } from "@/lib/booking/server/recurringScheduleService";
import { getRecurringDeps } from "@/lib/booking/server/recurringRuntime";

export const runtime = "nodejs";

const ACTIONS = ["skip-occurrence", "resume", "end"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(request: Request, context: { params: Promise<{ scheduleId: string; action: string }> }) {
  try {
    await verifyInternalAdminAccess(request);
  } catch (error) {
    if (error instanceof InternalAdminAuthError) {
      return NextResponse.json({ ok: false, message: "Invalid or missing internal admin credentials." }, { status: 401 });
    }
    throw error;
  }

  const { scheduleId, action } = await context.params;
  if (!ACTIONS.includes(action as Action)) {
    return NextResponse.json({ ok: false, message: "Unknown action." }, { status: 404 });
  }

  const deps = getRecurringDeps();
  try {
    const result =
      action === "skip-occurrence"
        ? await skipNextOccurrence(scheduleId, deps)
        : action === "resume"
          ? await resumeSchedule(scheduleId, deps)
          : await endScheduleByOwner(scheduleId, deps);

    if (result.outcome === "schedule-not-found") {
      return NextResponse.json({ ok: false, outcome: result.outcome, message: "Recurring schedule not found." }, { status: 404 });
    }
    if (result.outcome === "not-applicable") {
      return NextResponse.json({ ok: false, outcome: result.outcome, message: result.message }, { status: 409 });
    }
    return NextResponse.json({ ok: true, outcome: result.outcome, generation: result.generation ?? null, stop: result.stop ?? null }, { status: 200 });
  } catch (error) {
    console.error(`[api/internal/recurring-schedules/${action}] failed:`, error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to complete this action right now." }, { status: 500 });
  }
}

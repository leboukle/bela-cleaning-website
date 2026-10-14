// SERVER-ONLY API route behind the owner's "Test the Sheet's duplicate
// protection" button. Fires several SIMULTANEOUS once-only claims on one
// brand-new key against the real Recurring Schedule Events worksheet and
// reports how many believed they won. Exactly one is correct; anything
// else means appends are NOT being ordered the way the recurring-schedule
// design assumes, and recurring scheduling must not be enabled.
// Writes only `selftest:`-prefixed claim rows; touches no booking,
// schedule, customer or Stripe data.
import { NextResponse } from "next/server";
import { verifyInternalAdminAccess, InternalAdminAuthError } from "@/lib/booking/server/adminAccess";
import { runClaimSelfTest } from "@/lib/booking/server/googleRecurringScheduleRepository";
import { getRecurringScheduleRepository } from "@/lib/booking/server/recurringRuntime";

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
    const repository = getRecurringScheduleRepository();
    const rounds = [];
    for (let i = 0; i < 3; i++) rounds.push(await runClaimSelfTest(repository, 8));
    const passed = rounds.every((r) => r.passed);
    return NextResponse.json({
      ok: passed,
      rounds: rounds.map((r) => ({ contenders: r.contenders, winners: r.winners, passed: r.passed })),
      message: passed
        ? "Passed: in 3 rounds of 8 simultaneous attempts, exactly one attempt won each time."
        : "FAILED: more than one (or no) simultaneous attempt won. Do not rely on recurring scheduling until this is resolved.",
    });
  } catch (error) {
    const hint = error instanceof Error && /404|not found|Unable to parse range/i.test(error.message) ? " (is the \"Recurring Schedule Events\" tab created?)" : "";
    console.error("[api/internal/recurring-schedules/self-test] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: `The test could not run${hint}.` }, { status: 500 });
  }
}

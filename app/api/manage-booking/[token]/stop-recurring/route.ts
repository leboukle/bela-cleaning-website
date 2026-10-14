// SERVER-ONLY API route. Customer "Stop recurring cleanings" via a Manage
// Booking token. Ends the schedule (booking and payment history are
// untouched — only the schedule's Status changes) and cancels its upcoming
// appointment under the existing cancellation policy. All rules live in
// recurringScheduleService.stopRecurringByToken; this file only maps its
// typed, idempotent result onto an HTTP response.
import { NextResponse } from "next/server";
import { stopRecurringByToken } from "@/lib/booking/server/recurringScheduleService";
import { getRecurringDeps } from "@/lib/booking/server/recurringRuntime";
import { isRateLimited } from "@/lib/booking/server/rateLimit";

export const runtime = "nodejs";

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  return `manage-booking-stop:${ip}`;
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait a moment and try again." }, { status: 429 });
  }

  const { token } = await context.params;

  try {
    const result = await stopRecurringByToken(token, getRecurringDeps());
    switch (result.outcome) {
      case "invalid-token":
        return NextResponse.json({ ok: false, outcome: result.outcome, message: "This booking link is invalid or has expired." }, { status: 404 });
      case "not-recurring":
        return NextResponse.json({ ok: false, outcome: result.outcome, message: "This booking is not part of a recurring schedule." }, { status: 409 });
      default: {
        const lateFee = result.cancelled.some((c) => c.result.outcome === "cancelled-fee-initiated" || c.result.outcome === "cancelled-fee-submission-failed");
        const message =
          result.outcome === "already-ended"
            ? "Your recurring cleanings have already been stopped."
            : lateFee
              ? "Your recurring cleanings have been stopped. Your upcoming cleaning was within 24 hours, so the late-cancellation fee applies."
              : result.cancelled.length > 0
                ? "Your recurring cleanings have been stopped and your upcoming cleaning was cancelled. No charge was made."
                : "Your recurring cleanings have been stopped. No further cleanings will be scheduled.";
        return NextResponse.json({ ok: true, outcome: result.outcome, message }, { status: 200 });
      }
    }
  } catch (error) {
    console.error("[api/manage-booking/stop-recurring] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to stop your recurring cleanings right now. Please try again." }, { status: 500 });
  }
}

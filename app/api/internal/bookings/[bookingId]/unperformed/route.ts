// SERVER-ONLY API route. BeLa's explicit "this visit did not happen" action:
// the appointment is closed as a no-charge cancellation so it can never
// receive a normal service charge, and — for a recurring appointment —
// the schedule advances to its next regular occurrence. Same
// session-cookie-or-header gate as /api/internal/bookings/<id>/complete.
// Must be used BEFORE the scheduled charge is attempted (service end + 1
// hour); afterwards it is a refund decision in Stripe, which this cannot do.
import { NextResponse } from "next/server";
import { verifyInternalAdminAccess, InternalAdminAuthError } from "@/lib/booking/server/adminAccess";
import { markBookingUnperformed, type MarkUnperformedOutcome } from "@/lib/booking/server/completionService";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { advanceScheduleAfterChange } from "@/lib/booking/server/recurringRuntime";

export const runtime = "nodejs";

const bookingRepository = new GoogleSheetsBookingRepository();

function messageFor(result: MarkUnperformedOutcome): string {
  switch (result.outcome) {
    case "not-found":
      return "Booking not found.";
    case "already-cancelled":
      return "This booking is already cancelled.";
    case "already-completed":
      return `This booking was already marked complete at ${result.completedAt}, so it cannot be marked unperformed.`;
    case "already-charged":
      return `This booking's payment is already ${result.paymentStatus}. It can no longer be closed without a charge here — refund it in Stripe if needed.`;
    case "marked-unperformed":
      return `Marked unperformed at ${result.cancelledAt}. It will not be charged.`;
  }
}

const STATUS_BY_OUTCOME: Record<MarkUnperformedOutcome["outcome"], number> = {
  "not-found": 404,
  "already-cancelled": 200,
  "already-completed": 409,
  "already-charged": 409,
  "marked-unperformed": 200,
};

export async function POST(request: Request, context: { params: Promise<{ bookingId: string }> }) {
  try {
    await verifyInternalAdminAccess(request);
  } catch (error) {
    if (error instanceof InternalAdminAuthError) {
      return NextResponse.json({ ok: false, message: "Invalid or missing internal admin credentials." }, { status: 401 });
    }
    throw error;
  }

  const { bookingId } = await context.params;

  try {
    const result = await markBookingUnperformed(bookingId, bookingRepository);
    if (result.outcome === "marked-unperformed" || result.outcome === "already-cancelled") {
      await advanceScheduleAfterChange(bookingId);
    }
    return NextResponse.json(
      { ok: STATUS_BY_OUTCOME[result.outcome] < 400, outcome: result.outcome, message: messageFor(result) },
      { status: STATUS_BY_OUTCOME[result.outcome] },
    );
  } catch (error) {
    console.error("[api/internal/bookings/unperformed] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to mark this booking unperformed right now." }, { status: 500 });
  }
}

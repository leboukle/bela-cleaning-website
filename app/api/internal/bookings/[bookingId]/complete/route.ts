// SERVER-ONLY API route. BeLa's explicit "mark this booking complete"
// action — the one write path for the previously-dormant "Completed At"
// column, and the authoritative human-confirmed signal that gates the
// post-cleaning payout statement (see completionService.ts). Same
// session-cookie-or-header gate as /api/internal/cleaner-assignments —
// see adminAccess.ts.
import { NextResponse } from "next/server";
import { verifyInternalAdminAccess, InternalAdminAuthError } from "@/lib/booking/server/adminAccess";
import { markBookingComplete, type MarkCompleteOutcome } from "@/lib/booking/server/completionService";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";

export const runtime = "nodejs";

const bookingRepository = new GoogleSheetsBookingRepository();

function messageFor(result: MarkCompleteOutcome): string {
  switch (result.outcome) {
    case "not-found":
      return "Booking not found.";
    case "booking-cancelled":
      return "This booking is cancelled and cannot be marked complete.";
    case "already-completed":
      return `This booking was already marked complete at ${result.completedAt}.`;
    case "completed":
      return `Marked complete at ${result.completedAt}.`;
  }
}

const STATUS_BY_OUTCOME: Record<MarkCompleteOutcome["outcome"], number> = {
  "not-found": 404,
  "booking-cancelled": 409,
  "already-completed": 200,
  completed: 200,
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
    const result = await markBookingComplete(bookingId, bookingRepository);
    return NextResponse.json(
      { ok: result.outcome === "completed" || result.outcome === "already-completed", outcome: result.outcome, message: messageFor(result) },
      { status: STATUS_BY_OUTCOME[result.outcome] },
    );
  } catch (error) {
    console.error("[api/internal/bookings/complete] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to mark this booking complete right now." }, { status: 500 });
  }
}

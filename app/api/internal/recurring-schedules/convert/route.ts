// SERVER-ONLY API route. BeLa's owner-assisted conversion of ONE existing
// frequency-labelled booking into a recurring schedule:
//
//   POST /api/internal/recurring-schedules/convert
//   { "bookingId": "BELA-…", "customerConfirmed": true, "confirmationNote": "Confirmed by email on …" }
//
// Never automatic — existing bookings are only ever converted by this
// explicit action, after the customer has confirmed. Their booked amounts,
// Stripe IDs and payment history are untouched. Same session-cookie-or-
// header gate as every other internal route (see adminAccess.ts).
import { NextResponse } from "next/server";
import { verifyInternalAdminAccess, InternalAdminAuthError } from "@/lib/booking/server/adminAccess";
import { convertExistingBookingToSchedule } from "@/lib/booking/server/recurringScheduleService";
import { getRecurringDeps } from "@/lib/booking/server/recurringRuntime";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4_000;

export async function POST(request: Request) {
  try {
    await verifyInternalAdminAccess(request);
  } catch (error) {
    if (error instanceof InternalAdminAuthError) {
      return NextResponse.json({ ok: false, message: "Invalid or missing internal admin credentials." }, { status: 401 });
    }
    throw error;
  }

  let body: { bookingId?: unknown; customerConfirmed?: unknown; confirmationNote?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, message: "Request body is too large." }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.bookingId !== "string" || body.bookingId.length === 0 || body.bookingId.length > 64) {
    return NextResponse.json({ ok: false, message: "bookingId is required." }, { status: 422 });
  }

  try {
    const result = await convertExistingBookingToSchedule(
      body.bookingId,
      {
        customerConfirmed: body.customerConfirmed === true,
        note: typeof body.confirmationNote === "string" ? body.confirmationNote.slice(0, 300) : "",
      },
      getRecurringDeps(),
    );
    if (result.outcome === "refused") {
      const status = result.reason === "booking-not-found" ? 404 : result.reason === "customer-confirmation-required" ? 422 : 409;
      return NextResponse.json({ ok: false, outcome: result.outcome, reason: result.reason, message: result.message }, { status });
    }
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    console.error("[api/internal/recurring-schedules/convert] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to convert this booking right now." }, { status: 500 });
  }
}

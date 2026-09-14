// SERVER-ONLY API route. BeLa's own manual cleaner-assignment action —
// authenticated by a SEPARATE secret (INTERNAL_ADMIN_SECRET) from the
// Apps Script scheduler's PAYMENT_SCHEDULER_SECRET (see
// internalAdminAuth.ts). The internal assignment page's browser UI
// (components/internal/AssignCleanerForm.tsx) authenticates via its
// HttpOnly session cookie, sent automatically on same-origin requests —
// it never sees or sends the raw secret. The x-internal-admin-secret
// header remains accepted as a fallback for non-browser/internal callers
// (see adminAccess.ts's verifyInternalAdminAccess). All sequencing/
// validation lives in assignmentService.ts — this file is HTTP plumbing only.
import { NextResponse } from "next/server";
import { verifyInternalAdminAccess, InternalAdminAuthError } from "@/lib/booking/server/adminAccess";
import { createAssignment, type CreateAssignmentOutcome } from "@/lib/booking/server/assignmentService";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { GoogleSheetsCleanerRepository } from "@/lib/booking/server/googleCleanerRepository";
import { CleanerNotificationService } from "@/lib/booking/server/cleanerNotificationService";
import { GmailApiTransport } from "@/lib/booking/server/email/gmailTransport";

export const runtime = "nodejs";

const bookingRepository = new GoogleSheetsBookingRepository();
const assignmentRepository = new GoogleSheetsCleanerRepository();
const notifications = new CleanerNotificationService(new GmailApiTransport());

type RequestBody = { bookingId?: unknown; cleanerId?: unknown };

function messageFor(result: CreateAssignmentOutcome): string {
  switch (result.outcome) {
    case "booking-not-found":
      return "Booking not found.";
    case "booking-cancelled":
      return "This booking is cancelled and cannot be assigned.";
    case "cleaner-not-found":
      return "Cleaner not found.";
    case "cleaner-inactive":
      return "This cleaner is not Active.";
    case "already-assigned":
      return `This booking already has a ${result.existingStatus} assignment.`;
    case "too-close-to-service-start":
      return `This appointment starts in about ${result.hoursUntilServiceStart.toFixed(1)} hours — too soon for an automated assignment. Please contact the cleaner directly.`;
    case "created":
      return `Assignment created. Response deadline: ${result.responseDeadline}.`;
  }
}

const STATUS_BY_OUTCOME: Record<CreateAssignmentOutcome["outcome"], number> = {
  "booking-not-found": 404,
  "booking-cancelled": 409,
  "cleaner-not-found": 404,
  "cleaner-inactive": 409,
  "already-assigned": 409,
  "too-close-to-service-start": 422,
  created: 200,
};

export async function POST(request: Request) {
  try {
    await verifyInternalAdminAccess(request);
  } catch (error) {
    if (error instanceof InternalAdminAuthError) {
      return NextResponse.json({ ok: false, message: "Invalid or missing internal admin credentials." }, { status: 401 });
    }
    throw error;
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  const cleanerId = typeof body.cleanerId === "string" ? body.cleanerId.trim() : "";
  if (!bookingId || !cleanerId) {
    return NextResponse.json({ ok: false, message: "bookingId and cleanerId are required." }, { status: 422 });
  }

  try {
    const result = await createAssignment(bookingId, cleanerId, bookingRepository, assignmentRepository, notifications);
    return NextResponse.json(
      { ok: result.outcome === "created", outcome: result.outcome, message: messageFor(result) },
      { status: STATUS_BY_OUTCOME[result.outcome] },
    );
  } catch (error) {
    console.error("[api/internal/cleaner-assignments] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to create this assignment right now." }, { status: 500 });
  }
}

// SERVER-ONLY API route. Cleaner's Accept action — only ever reached via a
// real button click / POST from the assignment page (never a bare email
// link, see cleanerAssignmentOffer.ts). All sequencing, idempotency, and
// expiry-self-heal logic lives in assignmentService.ts — this file only
// maps its typed result onto an HTTP response. Mirrors
// app/api/manage-booking/[token]/cancel/route.ts.
import { NextResponse } from "next/server";
import { acceptAssignment, type RespondOutcome } from "@/lib/booking/server/assignmentService";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { GoogleSheetsCleanerRepository } from "@/lib/booking/server/googleCleanerRepository";
import { CleanerNotificationService } from "@/lib/booking/server/cleanerNotificationService";
import { GmailApiTransport } from "@/lib/booking/server/email/gmailTransport";
import { isRateLimited } from "@/lib/booking/server/rateLimit";

export const runtime = "nodejs";

const bookingRepository = new GoogleSheetsBookingRepository();
const assignmentRepository = new GoogleSheetsCleanerRepository();
const notifications = new CleanerNotificationService(new GmailApiTransport());

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  return `cleaner-assignment-accept:${ip}`;
}

function messageFor(result: RespondOutcome): string {
  switch (result.outcome) {
    case "invalid-token":
      return "This assignment link is invalid or has expired.";
    case "already-resolved":
      return `This assignment is already ${result.status}. If you need to make a change, please contact BeLa Cleaning directly.`;
    case "expired":
      return "This assignment's response window has passed. Please contact BeLa Cleaning directly.";
    case "accepted":
      return "You've accepted this assignment. If your availability changes, please contact BeLa Cleaning directly.";
    case "declined":
      return "This assignment has been declined.";
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait a moment and try again." }, { status: 429 });
  }

  const { token } = await context.params;

  try {
    const result = await acceptAssignment(token, bookingRepository, assignmentRepository, notifications);
    return NextResponse.json({ ok: result.outcome === "accepted", outcome: result.outcome, message: messageFor(result) });
  } catch (error) {
    console.error("[api/cleaner-assignment/accept] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to process this right now. Please try again." }, { status: 500 });
  }
}

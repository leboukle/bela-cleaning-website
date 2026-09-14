// SERVER-ONLY API route. Resolves a cleaner-assignment token to the
// cleaner-safe assignment view — all token validation and field
// whitelisting happens in cleanerAssignmentAccess.ts/cleanerAssignmentView.ts;
// this file is HTTP plumbing only. Mirrors app/api/manage-booking/[token]/route.ts.
import { NextResponse } from "next/server";
import { getCleanerAssignmentView } from "@/lib/booking/server/cleanerAssignmentAccess";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { GoogleSheetsCleanerRepository } from "@/lib/booking/server/googleCleanerRepository";
import { isRateLimited } from "@/lib/booking/server/rateLimit";

export const runtime = "nodejs";

const bookingRepository = new GoogleSheetsBookingRepository();
const assignmentRepository = new GoogleSheetsCleanerRepository();

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  return `cleaner-assignment:${ip}`;
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait a moment and try again." }, { status: 429 });
  }

  const { token } = await context.params;

  try {
    const result = await getCleanerAssignmentView(token, bookingRepository, assignmentRepository);
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: "This assignment link is invalid or has expired." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, assignment: result.view });
  } catch (error) {
    console.error("[api/cleaner-assignment] failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, message: "Unable to load this assignment right now." }, { status: 500 });
  }
}

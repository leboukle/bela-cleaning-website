// SERVER-ONLY API route. Called only by the Google Apps Script
// cleaner-assignment scheduler, on an hourly time-driven trigger, for
// Accepted assignments whose booking now has a "Completed At" timestamp
// but no payout statement sent yet. Re-validates every condition
// independently — see completionService.ts's processPayoutStatementDue.
import { NextResponse } from "next/server";
import { verifySchedulerRequest, SchedulerAuthError } from "@/lib/booking/server/schedulerAuth";
import { processPayoutStatementDue } from "@/lib/booking/server/completionService";
import { GoogleSheetsBookingRepository } from "@/lib/booking/server/googleSheetsRepository";
import { GoogleSheetsCleanerRepository } from "@/lib/booking/server/googleCleanerRepository";
import { CleanerNotificationService } from "@/lib/booking/server/cleanerNotificationService";
import { GmailApiTransport } from "@/lib/booking/server/email/gmailTransport";

export const runtime = "nodejs";

const bookingRepository = new GoogleSheetsBookingRepository();
const assignmentRepository = new GoogleSheetsCleanerRepository();
const notifications = new CleanerNotificationService(new GmailApiTransport());

const MAX_IDS_PER_REQUEST = 100;
const MAX_BODY_BYTES = 20_000;

type RequestBody = { assignmentIds?: unknown };

export async function POST(request: Request) {
  try {
    verifySchedulerRequest(request.headers);
  } catch (error) {
    if (error instanceof SchedulerAuthError) {
      return NextResponse.json({ ok: false, code: "unauthorized", message: "Invalid or missing scheduler credentials." }, { status: 401 });
    }
    throw error;
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, code: "payload-too-large", message: "Request body is too large." }, { status: 413 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ ok: false, code: "invalid-json", message: "Invalid request body." }, { status: 400 });
  }

  let body: RequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, code: "invalid-json", message: "Invalid request body." }, { status: 400 });
  }

  const assignmentIds = body.assignmentIds;
  if (!Array.isArray(assignmentIds) || assignmentIds.some((id) => typeof id !== "string" || id.length === 0)) {
    return NextResponse.json({ ok: false, code: "validation", message: "assignmentIds must be a non-empty array of strings." }, { status: 422 });
  }
  if (assignmentIds.length === 0) {
    return NextResponse.json({ ok: true, results: [] }, { status: 200 });
  }
  if (assignmentIds.length > MAX_IDS_PER_REQUEST) {
    return NextResponse.json(
      { ok: false, code: "validation", message: `No more than ${MAX_IDS_PER_REQUEST} assignment IDs per request.` },
      { status: 422 },
    );
  }

  const now = new Date();
  const results = [];
  for (const assignmentId of assignmentIds) {
    try {
      const outcome = await processPayoutStatementDue(assignmentId, bookingRepository, assignmentRepository, notifications, now);
      results.push(outcome);
    } catch (error) {
      console.error(
        `[api/cleaner-assignments/payout-statements/process-due] unhandled error: assignmentId=${assignmentId}`,
        error instanceof Error ? error.message : "unknown error",
      );
      results.push({ assignmentId, outcome: "error" as const });
    }
  }

  return NextResponse.json({ ok: true, results }, { status: 200 });
}

// SERVER-ONLY. Composition root for recurring schedules: the real Google
// Sheets repositories and Gmail-backed notification service, wired once per
// warm serverless instance. Routes import from here so every entry point
// (completion, cancellation, stop, reconciliation, owner actions) builds
// its dependencies identically. Holds no per-request state.
import "server-only";
import { GoogleSheetsBookingRepository } from "./googleSheetsRepository";
import { GoogleRecurringScheduleRepository } from "./googleRecurringScheduleRepository";
import { NotificationService } from "./notificationService";
import { GmailApiTransport } from "./email/gmailTransport";
import { afterAppointmentChanged, type RecurringDeps } from "./recurringScheduleService";

const bookings = new GoogleSheetsBookingRepository();
const schedules = new GoogleRecurringScheduleRepository();
const notifications = new NotificationService(new GmailApiTransport());

export function getRecurringDeps(): RecurringDeps {
  return { bookings, schedules, notifications };
}

export function getRecurringScheduleRepository(): GoogleRecurringScheduleRepository {
  return schedules;
}

/**
 * Best-effort trigger used after a completion, cancellation or unperformed
 * mark. Never throws: the user-facing action has already succeeded, and the
 * reconciliation scheduler recovers any generation that did not happen
 * here — so a failure is logged, not surfaced.
 */
export async function advanceScheduleAfterChange(bookingId: string): Promise<void> {
  try {
    await afterAppointmentChanged(bookingId, getRecurringDeps());
  } catch (error) {
    console.error(
      `[recurringRuntime] advance after change failed: bookingId=${bookingId}`,
      error instanceof Error ? error.message : "unknown error",
    );
  }
}

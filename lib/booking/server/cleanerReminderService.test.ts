import { describe, it, expect, vi } from "vitest";
import { processCleanerReminderForAssignment } from "./cleanerReminderService";
import { ASSIGNMENT_STATUS, CLEANER_REMINDER_STATUS } from "./cleanerSheetSchema";
import { BOOKING_STATUS } from "./bookingsSheetSchema";
import { sampleBookingRecord } from "./testFixtures";
import type { BookingRepository, IdempotentBookingResult } from "./repository";
import type { CleanerAssignmentRepository } from "./cleanerRepository";
import type { AssignmentRecord, CleanerReminderUpdate, CleanerRecord } from "./cleanerTypes";
import type {
  AssignableBookingSummary,
  BookingPaymentState,
  BookingRecord,
  BookingReminderState,
} from "./types";

class FakeBookingRepository implements Partial<BookingRepository> {
  records = new Map<string, BookingRecord>();
  async getFullBookingRecord(bookingId: string): Promise<BookingRecord | null> {
    return this.records.get(bookingId) ?? null;
  }
  async appendBooking(): Promise<void> {}
  async bookingIdExists(): Promise<boolean> {
    return false;
  }
  async findRecentBookingByIdempotencyToken(): Promise<IdempotentBookingResult | null> {
    return null;
  }
  async updateNotificationStatus(): Promise<void> {}
  async getBookingPaymentState(): Promise<BookingPaymentState | null> {
    return null;
  }
  async updatePaymentAttempt(): Promise<void> {}
  async findBookingIdByManageTokenHash(): Promise<string | null> {
    return null;
  }
  async markBookingCancelled(): Promise<void> {}
  async updateCancellationFeeOutcome(): Promise<void> {}
  async updateBookingReschedule(): Promise<void> {}
  async getBookingReminderState(): Promise<BookingReminderState | null> {
    return null;
  }
  async updateAppointmentReminderStatus(): Promise<void> {}
  async listAssignableBookings(): Promise<AssignableBookingSummary[]> {
    return [];
  }
  async markBookingCompleted(): Promise<void> {}
}

class FakeAssignmentRepository implements CleanerAssignmentRepository {
  cleaners = new Map<string, CleanerRecord>();
  assignments = new Map<string, AssignmentRecord>();
  reminderUpdates: Array<{ assignmentId: string; update: CleanerReminderUpdate }> = [];

  async getActiveCleaners(): Promise<CleanerRecord[]> {
    return [...this.cleaners.values()];
  }
  async getCleanerById(cleanerId: string): Promise<CleanerRecord | null> {
    return this.cleaners.get(cleanerId) ?? null;
  }
  async getLatestAssignmentForBooking(): Promise<AssignmentRecord | null> {
    return null;
  }
  async createAssignment(): Promise<void> {}
  async findAssignmentByTokenHash(): Promise<AssignmentRecord | null> {
    return null;
  }
  async getAssignmentById(assignmentId: string): Promise<AssignmentRecord | null> {
    return this.assignments.get(assignmentId) ?? null;
  }
  async updateAssignmentResolution(): Promise<void> {}
  async updateCleanerReminderStatus(assignmentId: string, update: CleanerReminderUpdate): Promise<void> {
    this.reminderUpdates.push({ assignmentId, update });
    const assignment = this.assignments.get(assignmentId);
    if (assignment) Object.assign(assignment, update);
  }
  async markPayoutStatementSent(): Promise<void> {}
}

function fakeAssignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return {
    assignmentId: "ASGN-1",
    bookingId: "BELA-1",
    cleanerId: "CLNR-AAAAAA",
    cleanerName: "Susie Smith",
    status: ASSIGNMENT_STATUS.ACCEPTED,
    offeredAt: "",
    responseDeadline: "",
    acceptedAt: "some time",
    declinedAt: "",
    expiredAt: "",
    cleaningTotalSnapshot: 190.5,
    payoutPercentageSnapshot: 0.6,
    payoutAmountSnapshot: 114.3,
    assignmentTokenHash: "hash",
    cleanerReminderStatus: "",
    cleanerReminderSentAt: "",
    cleanerReminderAttempts: 0,
    payoutStatementSentAt: "",
    ...overrides,
  };
}

function fakeCleaner(): CleanerRecord {
  return {
    cleanerId: "CLNR-AAAAAA",
    firstName: "Susie",
    lastName: "Smith",
    email: "susie@example.com",
    phone: "5551234567",
    status: "Active",
    createdAt: "",
  };
}

function fakeNotifications() {
  return { sendCleanerAppointmentReminder: vi.fn(async () => ({ ok: true as const })) };
}

// scheduledChargeAt is the 1-hour-post-end charge time; estimatedDurationMinutes
// then back-derives the real service start, same arithmetic as reminderService.ts.
const NOW = new Date("2026-02-15T00:00:00.000Z");
const SCHEDULED_CHARGE_AT_FOR_72H_OUT = new Date(NOW.getTime() + 72 * 60 * 60 * 1000 + 90 * 60_000).toISOString(); // service start ~72h out (90min = duration+delay)

describe("processCleanerReminderForAssignment", () => {
  it("returns not-found when the assignment doesn't exist", async () => {
    const result = await processCleanerReminderForAssignment("ASGN-MISSING", new FakeBookingRepository() as BookingRepository, new FakeAssignmentRepository(), fakeNotifications(), NOW);
    expect(result).toEqual({ assignmentId: "ASGN-MISSING", outcome: "not-found" });
  });

  it("skips a non-Accepted assignment (Pending)", async () => {
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment({ status: ASSIGNMENT_STATUS.PENDING }));
    const result = await processCleanerReminderForAssignment("ASGN-1", new FakeBookingRepository() as BookingRepository, assignmentRepo, fakeNotifications(), NOW);
    expect(result).toEqual({ assignmentId: "ASGN-1", outcome: "skipped-not-accepted", status: ASSIGNMENT_STATUS.PENDING });
  });

  it("skips an assignment whose reminder is already Sent (idempotent)", async () => {
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment({ cleanerReminderStatus: CLEANER_REMINDER_STATUS.SENT }));
    const notifications = fakeNotifications();
    const result = await processCleanerReminderForAssignment("ASGN-1", new FakeBookingRepository() as BookingRepository, assignmentRepo, notifications, NOW);
    expect(result.outcome).toBe("skipped-already-resolved");
    expect(notifications.sendCleanerAppointmentReminder).not.toHaveBeenCalled();
  });

  it("skips a cancelled booking", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1", bookingStatus: BOOKING_STATUS.CANCELLED }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment());
    const result = await processCleanerReminderForAssignment("ASGN-1", bookingRepo as unknown as BookingRepository, assignmentRepo, fakeNotifications(), NOW);
    expect(result).toEqual({ assignmentId: "ASGN-1", outcome: "skipped-cancelled-booking" });
  });

  it("sends the reminder and marks Sent when due", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set(
      "BELA-1",
      sampleBookingRecord({ bookingId: "BELA-1", scheduledChargeAt: SCHEDULED_CHARGE_AT_FOR_72H_OUT, estimatedDurationMinutes: 30 }),
    );
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment());
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    const notifications = fakeNotifications();

    const result = await processCleanerReminderForAssignment("ASGN-1", bookingRepo as unknown as BookingRepository, assignmentRepo, notifications, NOW);

    expect(result).toEqual({ assignmentId: "ASGN-1", outcome: "sent", attempt: 1 });
    expect(notifications.sendCleanerAppointmentReminder).toHaveBeenCalledTimes(1);
    expect(assignmentRepo.assignments.get("ASGN-1")?.cleanerReminderStatus).toBe(CLEANER_REMINDER_STATUS.SENT);
  });

  it("skips when not yet due (service start too far out)", async () => {
    const bookingRepo = new FakeBookingRepository();
    const farOutChargeAt = new Date(NOW.getTime() + 200 * 60 * 60 * 1000).toISOString();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1", scheduledChargeAt: farOutChargeAt, estimatedDurationMinutes: 30 }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment());
    const notifications = fakeNotifications();

    const result = await processCleanerReminderForAssignment("ASGN-1", bookingRepo as unknown as BookingRepository, assignmentRepo, notifications, NOW);

    expect(result).toEqual({ assignmentId: "ASGN-1", outcome: "skipped-not-due" });
    expect(notifications.sendCleanerAppointmentReminder).not.toHaveBeenCalled();
  });

  it("schedules a retry (not permanent failure) before the max attempt count", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set(
      "BELA-1",
      sampleBookingRecord({ bookingId: "BELA-1", scheduledChargeAt: SCHEDULED_CHARGE_AT_FOR_72H_OUT, estimatedDurationMinutes: 30 }),
    );
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment({ cleanerReminderAttempts: 0 }));
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    const notifications = { sendCleanerAppointmentReminder: vi.fn(async () => ({ ok: false as const, error: "send failed" })) };

    const result = await processCleanerReminderForAssignment("ASGN-1", bookingRepo as unknown as BookingRepository, assignmentRepo, notifications, NOW);

    expect(result).toEqual({ assignmentId: "ASGN-1", outcome: "retry-scheduled", attempt: 1 });
    expect(assignmentRepo.assignments.get("ASGN-1")?.cleanerReminderStatus).toBe(CLEANER_REMINDER_STATUS.RETRY_SCHEDULED);
  });

  it("marks permanently Failed after the 3rd attempt", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set(
      "BELA-1",
      sampleBookingRecord({ bookingId: "BELA-1", scheduledChargeAt: SCHEDULED_CHARGE_AT_FOR_72H_OUT, estimatedDurationMinutes: 30 }),
    );
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment({ cleanerReminderAttempts: 2 }));
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    const notifications = { sendCleanerAppointmentReminder: vi.fn(async () => ({ ok: false as const, error: "send failed" })) };

    const result = await processCleanerReminderForAssignment("ASGN-1", bookingRepo as unknown as BookingRepository, assignmentRepo, notifications, NOW);

    expect(result).toEqual({ assignmentId: "ASGN-1", outcome: "failed-permanently", attempt: 3 });
    expect(assignmentRepo.assignments.get("ASGN-1")?.cleanerReminderStatus).toBe(CLEANER_REMINDER_STATUS.FAILED);
  });
});

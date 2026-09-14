import { describe, it, expect, vi } from "vitest";
import { markBookingComplete, processPayoutStatementDue } from "./completionService";
import { ASSIGNMENT_STATUS } from "./cleanerSheetSchema";
import { BOOKING_STATUS } from "./bookingsSheetSchema";
import { sampleBookingRecord } from "./testFixtures";
import type { BookingRepository } from "./repository";
import type { CleanerAssignmentRepository } from "./cleanerRepository";
import type { AssignmentRecord, CleanerRecord } from "./cleanerTypes";
import type { BookingRecord } from "./types";

class FakeBookingRepository {
  records = new Map<string, BookingRecord>();
  async getFullBookingRecord(bookingId: string): Promise<BookingRecord | null> {
    return this.records.get(bookingId) ?? null;
  }
  async markBookingCompleted(bookingId: string, completedAt: string): Promise<void> {
    const record = this.records.get(bookingId);
    if (record) record.completedAt = completedAt;
  }
}

class FakeAssignmentRepository {
  cleaners = new Map<string, CleanerRecord>();
  assignments = new Map<string, AssignmentRecord>();
  payoutSentUpdates: Array<{ assignmentId: string; sentAt: string }> = [];

  async getCleanerById(cleanerId: string): Promise<CleanerRecord | null> {
    return this.cleaners.get(cleanerId) ?? null;
  }
  async getAssignmentById(assignmentId: string): Promise<AssignmentRecord | null> {
    return this.assignments.get(assignmentId) ?? null;
  }
  async markPayoutStatementSent(assignmentId: string, sentAt: string): Promise<void> {
    this.payoutSentUpdates.push({ assignmentId, sentAt });
    const assignment = this.assignments.get(assignmentId);
    if (assignment) assignment.payoutStatementSentAt = sentAt;
  }
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

const NOW = new Date("2026-02-15T12:00:00.000Z");

describe("markBookingComplete", () => {
  it("returns not-found for an unknown booking", async () => {
    const result = await markBookingComplete("BELA-MISSING", new FakeBookingRepository() as unknown as BookingRepository, NOW);
    expect(result).toEqual({ outcome: "not-found" });
  });

  it("refuses to complete a cancelled booking", async () => {
    const repo = new FakeBookingRepository();
    repo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1", bookingStatus: BOOKING_STATUS.CANCELLED }));
    const result = await markBookingComplete("BELA-1", repo as unknown as BookingRepository, NOW);
    expect(result).toEqual({ outcome: "booking-cancelled" });
  });

  it("marks a booking complete, writing Completed At", async () => {
    const repo = new FakeBookingRepository();
    repo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const result = await markBookingComplete("BELA-1", repo as unknown as BookingRepository, NOW);
    expect(result.outcome).toBe("completed");
    expect(repo.records.get("BELA-1")?.completedAt).not.toBe("");
  });

  it("is idempotent: marking an already-completed booking again does not overwrite the original timestamp", async () => {
    const repo = new FakeBookingRepository();
    repo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1", completedAt: "original timestamp" }));
    const result = await markBookingComplete("BELA-1", repo as unknown as BookingRepository, NOW);
    expect(result).toEqual({ outcome: "already-completed", completedAt: "original timestamp" });
    expect(repo.records.get("BELA-1")?.completedAt).toBe("original timestamp");
  });
});

describe("processPayoutStatementDue", () => {
  it("never fires from elapsed/scheduled time alone — only once Completed At is actually set", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1", completedAt: "" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment());
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    const notifications = { sendCleanerPayoutStatement: vi.fn(async () => ({ ok: true as const })) };

    const result = await processPayoutStatementDue(
      "ASGN-1",
      bookingRepo as unknown as BookingRepository,
      assignmentRepo as unknown as CleanerAssignmentRepository,
      notifications,
      NOW,
    );

    expect(result).toEqual({ assignmentId: "ASGN-1", outcome: "skipped-not-completed" });
    expect(notifications.sendCleanerPayoutStatement).not.toHaveBeenCalled();
  });

  it("sends the payout statement once Completed At is set on an Accepted assignment", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1", completedAt: "completed at some time" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment());
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    const notifications = { sendCleanerPayoutStatement: vi.fn(async () => ({ ok: true as const })) };

    const result = await processPayoutStatementDue(
      "ASGN-1",
      bookingRepo as unknown as BookingRepository,
      assignmentRepo as unknown as CleanerAssignmentRepository,
      notifications,
      NOW,
    );

    expect(result).toEqual({ assignmentId: "ASGN-1", outcome: "sent" });
    expect(notifications.sendCleanerPayoutStatement).toHaveBeenCalledTimes(1);
    expect(assignmentRepo.payoutSentUpdates).toHaveLength(1);
  });

  it("is idempotent: skips an assignment whose payout statement was already sent", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1", completedAt: "completed" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment({ payoutStatementSentAt: "already sent" }));
    const notifications = { sendCleanerPayoutStatement: vi.fn(async () => ({ ok: true as const })) };

    const result = await processPayoutStatementDue(
      "ASGN-1",
      bookingRepo as unknown as BookingRepository,
      assignmentRepo as unknown as CleanerAssignmentRepository,
      notifications,
      NOW,
    );

    expect(result).toEqual({ assignmentId: "ASGN-1", outcome: "skipped-already-sent" });
    expect(notifications.sendCleanerPayoutStatement).not.toHaveBeenCalled();
  });

  it("skips a non-Accepted assignment", async () => {
    const bookingRepo = new FakeBookingRepository();
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment({ status: ASSIGNMENT_STATUS.DECLINED }));
    const notifications = { sendCleanerPayoutStatement: vi.fn(async () => ({ ok: true as const })) };

    const result = await processPayoutStatementDue(
      "ASGN-1",
      bookingRepo as unknown as BookingRepository,
      assignmentRepo as unknown as CleanerAssignmentRepository,
      notifications,
      NOW,
    );

    expect(result).toEqual({ assignmentId: "ASGN-1", outcome: "skipped-not-accepted", status: ASSIGNMENT_STATUS.DECLINED });
  });

  it("does not mark sent when the send itself fails, so a later scheduler run can retry", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1", completedAt: "completed" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment());
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    const notifications = { sendCleanerPayoutStatement: vi.fn(async () => ({ ok: false as const, error: "send failed" })) };

    const result = await processPayoutStatementDue(
      "ASGN-1",
      bookingRepo as unknown as BookingRepository,
      assignmentRepo as unknown as CleanerAssignmentRepository,
      notifications,
      NOW,
    );

    expect(result).toEqual({ assignmentId: "ASGN-1", outcome: "send-failed" });
    expect(assignmentRepo.assignments.get("ASGN-1")?.payoutStatementSentAt).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import { getCleanerAssignmentView } from "./cleanerAssignmentAccess";
import { generateManageToken, hashManageToken } from "./manageToken";
import { ASSIGNMENT_STATUS } from "./cleanerSheetSchema";
import { sampleBookingRecord } from "./testFixtures";
import type { BookingRepository } from "./repository";
import type { CleanerAssignmentRepository } from "./cleanerRepository";
import type { AssignmentRecord } from "./cleanerTypes";
import type { BookingRecord } from "./types";

class FakeBookingRepository {
  records = new Map<string, BookingRecord>();
  async getFullBookingRecord(bookingId: string): Promise<BookingRecord | null> {
    return this.records.get(bookingId) ?? null;
  }
}

class FakeAssignmentRepository {
  assignments = new Map<string, AssignmentRecord>();
  async findAssignmentByTokenHash(tokenHash: string): Promise<AssignmentRecord | null> {
    return [...this.assignments.values()].find((a) => a.assignmentTokenHash === tokenHash) ?? null;
  }
}

function fakeAssignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return {
    assignmentId: "ASGN-1",
    bookingId: "BELA-1",
    cleanerId: "CLNR-AAAAAA",
    cleanerName: "Susie Smith",
    status: ASSIGNMENT_STATUS.PENDING,
    offeredAt: "",
    responseDeadline: new Date("2026-03-01T12:00:00.000Z").toISOString(),
    acceptedAt: "",
    declinedAt: "",
    expiredAt: "",
    cleaningTotalSnapshot: 190.5,
    payoutPercentageSnapshot: 0.6,
    payoutAmountSnapshot: 114.3,
    assignmentTokenHash: "",
    cleanerReminderStatus: "",
    cleanerReminderSentAt: "",
    cleanerReminderAttempts: 0,
    payoutStatementSentAt: "",
    ...overrides,
  };
}

describe("getCleanerAssignmentView", () => {
  it("resolves a valid token to its assignment view", async () => {
    const token = generateManageToken();
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment({ assignmentTokenHash: hashManageToken(token) }));

    const result = await getCleanerAssignmentView(
      token,
      bookingRepo as unknown as BookingRepository,
      assignmentRepo as unknown as CleanerAssignmentRepository,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.view.bookingId).toBe("BELA-1");
  });

  it("rejects a malformed/implausible token without ever querying the repository", async () => {
    const bookingRepo = new FakeBookingRepository();
    const assignmentRepo = new FakeAssignmentRepository();
    const result = await getCleanerAssignmentView(
      "short",
      bookingRepo as unknown as BookingRepository,
      assignmentRepo as unknown as CleanerAssignmentRepository,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a well-formed but unknown token", async () => {
    const bookingRepo = new FakeBookingRepository();
    const assignmentRepo = new FakeAssignmentRepository();
    const result = await getCleanerAssignmentView(
      generateManageToken(),
      bookingRepo as unknown as BookingRepository,
      assignmentRepo as unknown as CleanerAssignmentRepository,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects when the assignment's booking can no longer be found", async () => {
    const token = generateManageToken();
    const bookingRepo = new FakeBookingRepository(); // no records
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.set("ASGN-1", fakeAssignment({ assignmentTokenHash: hashManageToken(token) }));

    const result = await getCleanerAssignmentView(
      token,
      bookingRepo as unknown as BookingRepository,
      assignmentRepo as unknown as CleanerAssignmentRepository,
    );
    expect(result.ok).toBe(false);
  });
});

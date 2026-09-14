import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./settings", () => ({ getBookingSettings: vi.fn() }));
vi.mock("./serviceTime", async () => {
  const actual = await vi.importActual<typeof import("./serviceTime")>("./serviceTime");
  return { ...actual, resolveRecordStartSpec: vi.fn(), calculateServiceStart: vi.fn() };
});

import { getBookingSettings } from "./settings";
import { resolveRecordStartSpec, calculateServiceStart } from "./serviceTime";
import {
  createAssignment,
  acceptAssignment,
  declineAssignment,
  processExpireDueAssignment,
  listAssignableBookings,
} from "./assignmentService";
import { ASSIGNMENT_STATUS, CLEANER_STATUS } from "./cleanerSheetSchema";
import { BOOKING_STATUS } from "./bookingsSheetSchema";
import { generateManageToken, hashManageToken } from "./manageToken";
import { STANDARD_CLEANER_PAYOUT_PERCENTAGE } from "@/lib/booking/cleanerPayout";
import { sampleBookingRecord } from "./testFixtures";
import type { BookingRepository, IdempotentBookingResult } from "./repository";
import type { CleanerAssignmentRepository } from "./cleanerRepository";
import type { CleanerAssignmentNotificationSender, CleanerNotificationResult } from "./cleanerNotificationService";
import type {
  AssignmentResolutionUpdate,
  AssignmentRecord,
  CleanerReminderUpdate,
  CleanerRecord,
  CreateAssignmentUpdate,
} from "./cleanerTypes";
import type { AssignableBookingSummary, BookingPaymentState, BookingRecord, BookingReminderState } from "./types";

const mockedGetBookingSettings = vi.mocked(getBookingSettings);
const mockedResolveRecordStartSpec = vi.mocked(resolveRecordStartSpec);
const mockedCalculateServiceStart = vi.mocked(calculateServiceStart);

const NOW = new Date("2026-02-01T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

class FakeBookingRepository implements BookingRepository {
  records = new Map<string, BookingRecord>();

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
  async getFullBookingRecord(bookingId: string): Promise<BookingRecord | null> {
    return this.records.get(bookingId) ?? null;
  }
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
  async markBookingCompleted(bookingId: string, completedAt: string): Promise<void> {
    const record = this.records.get(bookingId);
    if (record) record.completedAt = completedAt;
  }
}

class FakeAssignmentRepository implements CleanerAssignmentRepository {
  cleaners = new Map<string, CleanerRecord>();
  assignments: AssignmentRecord[] = [];

  async getActiveCleaners(): Promise<CleanerRecord[]> {
    return [...this.cleaners.values()].filter((c) => c.status === CLEANER_STATUS.ACTIVE);
  }
  async getCleanerById(cleanerId: string): Promise<CleanerRecord | null> {
    return this.cleaners.get(cleanerId) ?? null;
  }
  async getLatestAssignmentForBooking(bookingId: string): Promise<AssignmentRecord | null> {
    const matches = this.assignments.filter((a) => a.bookingId === bookingId);
    return matches.length > 0 ? matches[matches.length - 1] : null;
  }
  async createAssignment(update: CreateAssignmentUpdate): Promise<void> {
    this.assignments.push({
      ...update,
      acceptedAt: "",
      declinedAt: "",
      expiredAt: "",
      cleanerReminderStatus: "",
      cleanerReminderSentAt: "",
      cleanerReminderAttempts: 0,
      payoutStatementSentAt: "",
    });
  }
  async findAssignmentByTokenHash(tokenHash: string): Promise<AssignmentRecord | null> {
    return this.assignments.find((a) => a.assignmentTokenHash === tokenHash) ?? null;
  }
  async getAssignmentById(assignmentId: string): Promise<AssignmentRecord | null> {
    return this.assignments.find((a) => a.assignmentId === assignmentId) ?? null;
  }
  async updateAssignmentResolution(assignmentId: string, update: AssignmentResolutionUpdate): Promise<void> {
    const assignment = this.assignments.find((a) => a.assignmentId === assignmentId);
    if (!assignment) throw new Error("Assignment ID not found.");
    Object.assign(assignment, update);
  }
  async updateCleanerReminderStatus(assignmentId: string, update: CleanerReminderUpdate): Promise<void> {
    const assignment = this.assignments.find((a) => a.assignmentId === assignmentId);
    if (assignment) Object.assign(assignment, update);
  }
  async markPayoutStatementSent(assignmentId: string, sentAt: string): Promise<void> {
    const assignment = this.assignments.find((a) => a.assignmentId === assignmentId);
    if (assignment) assignment.payoutStatementSentAt = sentAt;
  }
}

function fakeCleaner(overrides: Partial<CleanerRecord> = {}): CleanerRecord {
  return {
    cleanerId: "CLNR-AAAAAA",
    firstName: "Susie",
    lastName: "Smith",
    email: "susie@example.com",
    phone: "5551234567",
    status: CLEANER_STATUS.ACTIVE,
    createdAt: "01/01/2026, 12:00:00 PM EST",
    ...overrides,
  };
}

function fakeNotifications(): CleanerAssignmentNotificationSender {
  return {
    sendCleanerAssignmentOffer: vi.fn(async (): Promise<CleanerNotificationResult> => ({ ok: true })),
    sendInternalAssignmentAccepted: vi.fn(async (): Promise<CleanerNotificationResult> => ({ ok: true })),
    sendInternalAssignmentDeclined: vi.fn(async (): Promise<CleanerNotificationResult> => ({ ok: true })),
    sendInternalAssignmentExpired: vi.fn(async (): Promise<CleanerNotificationResult> => ({ ok: true })),
  };
}

beforeEach(() => {
  mockedGetBookingSettings.mockReset().mockResolvedValue({
    minimumLeadDays: 1,
    defaultDailyCapacity: 10,
    timezone: "America/New_York",
    schemaVersion: 1,
  });
  mockedResolveRecordStartSpec.mockReset().mockReturnValue({ hour: 10, minute: 0 });
  mockedCalculateServiceStart.mockReset();
});

describe("createAssignment", () => {
  it("returns booking-not-found when the booking doesn't exist", async () => {
    const bookingRepo = new FakeBookingRepository();
    const assignmentRepo = new FakeAssignmentRepository();
    const result = await createAssignment("BELA-MISSING", "CLNR-AAAAAA", bookingRepo, assignmentRepo, fakeNotifications(), NOW);
    expect(result.outcome).toBe("booking-not-found");
  });

  it("returns booking-cancelled for a cancelled booking", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1", bookingStatus: BOOKING_STATUS.CANCELLED }));
    const assignmentRepo = new FakeAssignmentRepository();
    const result = await createAssignment("BELA-1", "CLNR-AAAAAA", bookingRepo, assignmentRepo, fakeNotifications(), NOW);
    expect(result.outcome).toBe("booking-cancelled");
  });

  it("returns cleaner-not-found when the cleaner doesn't exist", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const assignmentRepo = new FakeAssignmentRepository();
    const result = await createAssignment("BELA-1", "CLNR-MISSING", bookingRepo, assignmentRepo, fakeNotifications(), NOW);
    expect(result.outcome).toBe("cleaner-not-found");
  });

  it("returns cleaner-inactive for an Inactive cleaner", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner({ status: CLEANER_STATUS.INACTIVE }));
    const result = await createAssignment("BELA-1", "CLNR-AAAAAA", bookingRepo, assignmentRepo, fakeNotifications(), NOW);
    expect(result.outcome).toBe("cleaner-inactive");
  });

  it("returns already-assigned when the booking already has a Pending assignment", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    assignmentRepo.assignments.push({
      assignmentId: "ASGN-1",
      bookingId: "BELA-1",
      cleanerId: "CLNR-OTHER",
      cleanerName: "Other Cleaner",
      status: ASSIGNMENT_STATUS.PENDING,
      offeredAt: "",
      responseDeadline: new Date(NOW.getTime() + HOUR_MS).toISOString(),
      acceptedAt: "",
      declinedAt: "",
      expiredAt: "",
      cleaningTotalSnapshot: 100,
      payoutPercentageSnapshot: 0.6,
      payoutAmountSnapshot: 60,
      assignmentTokenHash: "abc",
      cleanerReminderStatus: "",
      cleanerReminderSentAt: "",
      cleanerReminderAttempts: 0,
      payoutStatementSentAt: "",
    });
    const result = await createAssignment("BELA-1", "CLNR-AAAAAA", bookingRepo, assignmentRepo, fakeNotifications(), NOW);
    expect(result).toEqual({ outcome: "already-assigned", existingStatus: ASSIGNMENT_STATUS.PENDING });
  });

  it("allows a new assignment when the booking's prior assignment was Declined (history preserved, not overwritten)", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1", chargeAmount: 100 }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    assignmentRepo.assignments.push({
      assignmentId: "ASGN-OLD",
      bookingId: "BELA-1",
      cleanerId: "CLNR-OTHER",
      cleanerName: "Other Cleaner",
      status: ASSIGNMENT_STATUS.DECLINED,
      offeredAt: "",
      responseDeadline: "",
      acceptedAt: "",
      declinedAt: "some time",
      expiredAt: "",
      cleaningTotalSnapshot: 100,
      payoutPercentageSnapshot: 0.6,
      payoutAmountSnapshot: 60,
      assignmentTokenHash: "old-hash",
      cleanerReminderStatus: "",
      cleanerReminderSentAt: "",
      cleanerReminderAttempts: 0,
      payoutStatementSentAt: "",
    });
    mockedCalculateServiceStart.mockReturnValue(new Date(NOW.getTime() + 72 * HOUR_MS));

    const result = await createAssignment("BELA-1", "CLNR-AAAAAA", bookingRepo, assignmentRepo, fakeNotifications(), NOW);

    expect(result.outcome).toBe("created");
    expect(assignmentRepo.assignments).toHaveLength(2);
    expect(assignmentRepo.assignments[0].assignmentId).toBe("ASGN-OLD");
    expect(assignmentRepo.assignments[0].status).toBe(ASSIGNMENT_STATUS.DECLINED); // untouched
  });

  it("blocks creation when the appointment starts in less than 24 hours", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    mockedCalculateServiceStart.mockReturnValue(new Date(NOW.getTime() + 6 * HOUR_MS));

    const result = await createAssignment("BELA-1", "CLNR-AAAAAA", bookingRepo, assignmentRepo, fakeNotifications(), NOW);

    expect(result.outcome).toBe("too-close-to-service-start");
    expect(assignmentRepo.assignments).toHaveLength(0);
  });

  it("creates a Pending assignment with the standard 60% payout snapshotted automatically — no per-cleaner entry required — and sends the offer email", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1", chargeAmount: 200 }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    mockedCalculateServiceStart.mockReturnValue(new Date(NOW.getTime() + 72 * HOUR_MS));
    const notifications = fakeNotifications();

    const result = await createAssignment("BELA-1", "CLNR-AAAAAA", bookingRepo, assignmentRepo, notifications, NOW);

    expect(result).toEqual(
      expect.objectContaining({ outcome: "created", payoutAmount: 120 }),
    );
    expect(assignmentRepo.assignments).toHaveLength(1);
    const created = assignmentRepo.assignments[0];
    expect(created.status).toBe(ASSIGNMENT_STATUS.PENDING);
    expect(created.cleaningTotalSnapshot).toBe(200);
    expect(created.payoutPercentageSnapshot).toBe(STANDARD_CLEANER_PAYOUT_PERCENTAGE);
    expect(created.payoutAmountSnapshot).toBe(120);
    expect(created.assignmentTokenHash).not.toBe("");
    expect(notifications.sendCleanerAssignmentOffer).toHaveBeenCalledTimes(1);
  });

  it("still creates the assignment (never rolled back) when the offer email fails to send, and reports created-email-failed", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1", chargeAmount: 200 }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    mockedCalculateServiceStart.mockReturnValue(new Date(NOW.getTime() + 72 * HOUR_MS));
    const notifications = fakeNotifications();
    // The real shape every notification-sender method in this codebase
    // uses for a provider-level failure: a non-throwing { ok: false }
    // result, never a rejected promise. This is exactly the case that
    // was previously silently swallowed.
    notifications.sendCleanerAssignmentOffer = vi.fn(async () => ({ ok: false as const, error: "Gmail API error: quota exceeded" }));

    const result = await createAssignment("BELA-1", "CLNR-AAAAAA", bookingRepo, assignmentRepo, notifications, NOW);

    expect(result).toEqual(
      expect.objectContaining({ outcome: "created-email-failed", payoutAmount: 120 }),
    );
    // History is preserved exactly as on a successful send — same row,
    // same Pending status, same snapshots. The assignment is never rolled
    // back or deleted because its email failed.
    expect(assignmentRepo.assignments).toHaveLength(1);
    const created = assignmentRepo.assignments[0];
    expect(created.status).toBe(ASSIGNMENT_STATUS.PENDING);
    expect(created.assignmentTokenHash).not.toBe("");
  });

  it("logs a send failure without the cleaner's email address or name", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner({ firstName: "Susie", lastName: "Smith", email: "susie@example.com" }));
    mockedCalculateServiceStart.mockReturnValue(new Date(NOW.getTime() + 72 * HOUR_MS));
    const notifications = fakeNotifications();
    notifications.sendCleanerAssignmentOffer = vi.fn(async () => ({ ok: false as const, error: "Gmail API error: quota exceeded" }));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await createAssignment("BELA-1", "CLNR-AAAAAA", bookingRepo, assignmentRepo, notifications, NOW);

    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedText = consoleErrorSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(loggedText).not.toContain("susie@example.com");
    expect(loggedText).not.toContain("Susie");
    expect(loggedText).not.toContain("Smith");
    expect(loggedText).toContain("Gmail API error: quota exceeded");

    consoleErrorSpy.mockRestore();
  });

  it("does NOT log an error when the offer email sends successfully", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    mockedCalculateServiceStart.mockReturnValue(new Date(NOW.getTime() + 72 * HOUR_MS));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createAssignment("BELA-1", "CLNR-AAAAAA", bookingRepo, assignmentRepo, fakeNotifications(), NOW);

    expect(result.outcome).toBe("created");
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("gives a 24-hour deadline when offered more than 48 hours before service start", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    mockedCalculateServiceStart.mockReturnValue(new Date(NOW.getTime() + 72 * HOUR_MS));

    const result = await createAssignment("BELA-1", "CLNR-AAAAAA", bookingRepo, assignmentRepo, fakeNotifications(), NOW);

    expect(result.outcome).toBe("created");
    if (result.outcome === "created") {
      expect(new Date(result.responseDeadline).getTime()).toBe(NOW.getTime() + 24 * HOUR_MS);
    }
  });

  it("gives a 12-hour deadline when offered between 24 and 48 hours before service start", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.cleaners.set("CLNR-AAAAAA", fakeCleaner());
    mockedCalculateServiceStart.mockReturnValue(new Date(NOW.getTime() + 30 * HOUR_MS));

    const result = await createAssignment("BELA-1", "CLNR-AAAAAA", bookingRepo, assignmentRepo, fakeNotifications(), NOW);

    expect(result.outcome).toBe("created");
    if (result.outcome === "created") {
      expect(new Date(result.responseDeadline).getTime()).toBe(NOW.getTime() + 12 * HOUR_MS);
    }
  });
});

describe("acceptAssignment / declineAssignment", () => {
  async function setupPendingAssignment(overrides: Partial<AssignmentRecord> = {}) {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const assignmentRepo = new FakeAssignmentRepository();
    const token = generateManageToken();
    assignmentRepo.assignments.push({
      assignmentId: "ASGN-1",
      bookingId: "BELA-1",
      cleanerId: "CLNR-AAAAAA",
      cleanerName: "Susie Smith",
      status: ASSIGNMENT_STATUS.PENDING,
      offeredAt: "01/01/2026, 12:00:00 PM EST",
      responseDeadline: new Date(NOW.getTime() + 24 * HOUR_MS).toISOString(),
      acceptedAt: "",
      declinedAt: "",
      expiredAt: "",
      cleaningTotalSnapshot: 190.5,
      payoutPercentageSnapshot: 0.6,
      payoutAmountSnapshot: 114.3,
      assignmentTokenHash: hashManageToken(token),
      cleanerReminderStatus: "",
      cleanerReminderSentAt: "",
      cleanerReminderAttempts: 0,
      payoutStatementSentAt: "",
      ...overrides,
    });
    return { bookingRepo, assignmentRepo, token };
  }

  it("accept: transitions Pending -> Accepted and notifies BeLa", async () => {
    const { bookingRepo, assignmentRepo, token } = await setupPendingAssignment();
    const notifications = fakeNotifications();

    const result = await acceptAssignment(token, bookingRepo, assignmentRepo, notifications, NOW);

    expect(result.outcome).toBe("accepted");
    expect(assignmentRepo.assignments[0].status).toBe(ASSIGNMENT_STATUS.ACCEPTED);
    expect(notifications.sendInternalAssignmentAccepted).toHaveBeenCalledTimes(1);
  });

  it("decline: transitions Pending -> Declined and notifies BeLa", async () => {
    const { bookingRepo, assignmentRepo, token } = await setupPendingAssignment();
    const notifications = fakeNotifications();

    const result = await declineAssignment(token, bookingRepo, assignmentRepo, notifications, NOW);

    expect(result.outcome).toBe("declined");
    expect(assignmentRepo.assignments[0].status).toBe(ASSIGNMENT_STATUS.DECLINED);
    expect(notifications.sendInternalAssignmentDeclined).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: accepting an already-Accepted assignment again is a safe no-op, not a duplicate transition", async () => {
    const { bookingRepo, assignmentRepo, token } = await setupPendingAssignment({ status: ASSIGNMENT_STATUS.ACCEPTED, acceptedAt: "already" });
    const notifications = fakeNotifications();

    const result = await acceptAssignment(token, bookingRepo, assignmentRepo, notifications, NOW);

    expect(result).toEqual({ outcome: "already-resolved", status: ASSIGNMENT_STATUS.ACCEPTED, assignment: assignmentRepo.assignments[0] });
    expect(notifications.sendInternalAssignmentAccepted).not.toHaveBeenCalled();
  });

  it("clicking Decline after already Declined is a safe no-op", async () => {
    const { bookingRepo, assignmentRepo, token } = await setupPendingAssignment({ status: ASSIGNMENT_STATUS.DECLINED, declinedAt: "already" });
    const notifications = fakeNotifications();

    const result = await declineAssignment(token, bookingRepo, assignmentRepo, notifications, NOW);

    expect(result.outcome).toBe("already-resolved");
    expect(notifications.sendInternalAssignmentDeclined).not.toHaveBeenCalled();
  });

  it("self-heals a Pending assignment past its deadline to Expired on read, and notifies BeLa", async () => {
    const { bookingRepo, assignmentRepo, token } = await setupPendingAssignment({
      responseDeadline: new Date(NOW.getTime() - HOUR_MS).toISOString(), // already past
    });
    const notifications = fakeNotifications();

    const result = await acceptAssignment(token, bookingRepo, assignmentRepo, notifications, NOW);

    expect(result.outcome).toBe("expired");
    expect(assignmentRepo.assignments[0].status).toBe(ASSIGNMENT_STATUS.EXPIRED);
    expect(notifications.sendInternalAssignmentExpired).toHaveBeenCalledTimes(1);
  });

  it("never accepts on an invalid/unknown token", async () => {
    const bookingRepo = new FakeBookingRepository();
    const assignmentRepo = new FakeAssignmentRepository();
    const result = await acceptAssignment("not-a-real-token", bookingRepo, assignmentRepo, fakeNotifications(), NOW);
    expect(result.outcome).toBe("invalid-token");
  });
});

describe("processExpireDueAssignment", () => {
  it("expires a Pending assignment past its deadline", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.push({
      assignmentId: "ASGN-1",
      bookingId: "BELA-1",
      cleanerId: "CLNR-AAAAAA",
      cleanerName: "Susie Smith",
      status: ASSIGNMENT_STATUS.PENDING,
      offeredAt: "",
      responseDeadline: new Date(NOW.getTime() - HOUR_MS).toISOString(),
      acceptedAt: "",
      declinedAt: "",
      expiredAt: "",
      cleaningTotalSnapshot: 100,
      payoutPercentageSnapshot: 0.6,
      payoutAmountSnapshot: 60,
      assignmentTokenHash: "hash",
      cleanerReminderStatus: "",
      cleanerReminderSentAt: "",
      cleanerReminderAttempts: 0,
      payoutStatementSentAt: "",
    });
    const notifications = fakeNotifications();

    const result = await processExpireDueAssignment("ASGN-1", bookingRepo, assignmentRepo, notifications, NOW);

    expect(result).toEqual({ outcome: "expired" });
    expect(assignmentRepo.assignments[0].status).toBe(ASSIGNMENT_STATUS.EXPIRED);
    expect(notifications.sendInternalAssignmentExpired).toHaveBeenCalledTimes(1);
  });

  it("does not expire a Pending assignment before its deadline", async () => {
    const bookingRepo = new FakeBookingRepository();
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.push({
      assignmentId: "ASGN-1",
      bookingId: "BELA-1",
      cleanerId: "CLNR-AAAAAA",
      cleanerName: "Susie Smith",
      status: ASSIGNMENT_STATUS.PENDING,
      offeredAt: "",
      responseDeadline: new Date(NOW.getTime() + HOUR_MS).toISOString(),
      acceptedAt: "",
      declinedAt: "",
      expiredAt: "",
      cleaningTotalSnapshot: 100,
      payoutPercentageSnapshot: 0.6,
      payoutAmountSnapshot: 60,
      assignmentTokenHash: "hash",
      cleanerReminderStatus: "",
      cleanerReminderSentAt: "",
      cleanerReminderAttempts: 0,
      payoutStatementSentAt: "",
    });

    const result = await processExpireDueAssignment("ASGN-1", bookingRepo, assignmentRepo, fakeNotifications(), NOW);

    expect(result).toEqual({ outcome: "not-yet-due" });
    expect(assignmentRepo.assignments[0].status).toBe(ASSIGNMENT_STATUS.PENDING);
  });

  it("is idempotent: does nothing to an assignment already resolved past Pending", async () => {
    const bookingRepo = new FakeBookingRepository();
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.push({
      assignmentId: "ASGN-1",
      bookingId: "BELA-1",
      cleanerId: "CLNR-AAAAAA",
      cleanerName: "Susie Smith",
      status: ASSIGNMENT_STATUS.ACCEPTED,
      offeredAt: "",
      responseDeadline: new Date(NOW.getTime() - HOUR_MS).toISOString(),
      acceptedAt: "already",
      declinedAt: "",
      expiredAt: "",
      cleaningTotalSnapshot: 100,
      payoutPercentageSnapshot: 0.6,
      payoutAmountSnapshot: 60,
      assignmentTokenHash: "hash",
      cleanerReminderStatus: "",
      cleanerReminderSentAt: "",
      cleanerReminderAttempts: 0,
      payoutStatementSentAt: "",
    });

    const result = await processExpireDueAssignment("ASGN-1", bookingRepo, assignmentRepo, fakeNotifications(), NOW);

    expect(result).toEqual({ outcome: "not-pending", status: ASSIGNMENT_STATUS.ACCEPTED });
  });
});

describe("listAssignableBookings", () => {
  it("excludes a booking that already has a Pending or Accepted assignment", async () => {
    const bookingRepo = new FakeBookingRepository();
    bookingRepo.listAssignableBookings = vi.fn(async () => [
      { bookingId: "BELA-1", bookingStatus: "Pending Payment", firstName: "Jane", streetAddress: "", apartmentOrUnit: "", city: "", state: "", zipCode: "", serviceDate: "2026-03-01", arrivalWindow: "", serviceStartTime: "10:00", cleaningType: "Standard cleaning", chargeAmount: 100 },
      { bookingId: "BELA-2", bookingStatus: "Pending Payment", firstName: "Amy", streetAddress: "", apartmentOrUnit: "", city: "", state: "", zipCode: "", serviceDate: "2026-03-02", arrivalWindow: "", serviceStartTime: "10:00", cleaningType: "Standard cleaning", chargeAmount: 100 },
    ]);
    const assignmentRepo = new FakeAssignmentRepository();
    assignmentRepo.assignments.push({
      assignmentId: "ASGN-1",
      bookingId: "BELA-1",
      cleanerId: "CLNR-AAAAAA",
      cleanerName: "Susie Smith",
      status: ASSIGNMENT_STATUS.PENDING,
      offeredAt: "",
      responseDeadline: "",
      acceptedAt: "",
      declinedAt: "",
      expiredAt: "",
      cleaningTotalSnapshot: 100,
      payoutPercentageSnapshot: 0.6,
      payoutAmountSnapshot: 60,
      assignmentTokenHash: "hash",
      cleanerReminderStatus: "",
      cleanerReminderSentAt: "",
      cleanerReminderAttempts: 0,
      payoutStatementSentAt: "",
    });

    const results = await listAssignableBookings(bookingRepo, assignmentRepo, "2026-03-01");

    expect(results.map((b) => b.bookingId)).toEqual(["BELA-2"]);
  });
});

import { describe, it, expect, vi } from "vitest";
import { processReminderForBooking, MAX_REMINDER_ATTEMPTS, type ReminderNotificationSender } from "./reminderService";
import { BOOKING_STATUS, APPOINTMENT_REMINDER_STATUS } from "./bookingsSheetSchema";
import { hashManageToken, isPlausibleManageToken } from "./manageToken";
import { formatOperationalTimestamp } from "./dateUtils";
import { sampleBookingRecord } from "./testFixtures";
import type { BookingRepository, IdempotentBookingResult } from "./repository";
import type {
  AppointmentReminderUpdate,
  AssignableBookingSummary,
  BookingCancellationInitiateUpdate,
  BookingPaymentState,
  BookingRecord,
  BookingReminderState,
  BookingRescheduleUpdate,
  CancellationFeeOutcomeUpdate,
  PaymentAttemptUpdate,
} from "./types";

class FakeRepository implements BookingRepository {
  records = new Map<string, BookingRecord>();
  reminderUpdates: Array<{ bookingId: string; update: AppointmentReminderUpdate }> = [];

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
  async updatePaymentAttempt(_bookingId: string, _update: PaymentAttemptUpdate): Promise<void> {}
  async markBookingCancelled(_bookingId: string, _update: BookingCancellationInitiateUpdate): Promise<void> {}
  async updateCancellationFeeOutcome(_bookingId: string, _update: CancellationFeeOutcomeUpdate): Promise<void> {}
  async updateBookingReschedule(_bookingId: string, _update: BookingRescheduleUpdate): Promise<void> {}

  async getFullBookingRecord(bookingId: string): Promise<BookingRecord | null> {
    return this.records.get(bookingId) ?? null;
  }

  async findBookingIdByManageTokenHash(): Promise<string | null> {
    return null;
  }

  async getBookingReminderState(bookingId: string): Promise<BookingReminderState | null> {
    const record = this.records.get(bookingId);
    if (!record) return null;
    return {
      bookingId: record.bookingId,
      bookingStatus: record.bookingStatus,
      appointmentReminderStatus: record.appointmentReminderStatus,
      appointmentReminderAttempts: record.appointmentReminderAttempts,
      scheduledChargeAt: record.scheduledChargeAt,
      estimatedDurationMinutes: record.estimatedDurationMinutes,
    };
  }

  async updateAppointmentReminderStatus(bookingId: string, update: AppointmentReminderUpdate): Promise<void> {
    this.reminderUpdates.push({ bookingId, update });
    const record = this.records.get(bookingId);
    if (!record) throw new Error("Booking ID not found.");
    record.appointmentReminderStatus = update.appointmentReminderStatus;
    record.appointmentReminderSentAt = update.appointmentReminderSentAt;
    record.appointmentReminderAttempts = update.appointmentReminderAttempts;
    record.manageBookingReminderTokenHash = update.manageBookingReminderTokenHash;
  }

  async listAssignableBookings(): Promise<AssignableBookingSummary[]> {
    return [];
  }
  async markBookingCompleted(): Promise<void> {}
}

function fakeNotifications(sendResult: { ok: true } | { ok: false; error: string } = { ok: true }) {
  const calls: Record<string, unknown[]> = { customer: [], internalSent: [], internalFailed: [], reminderTokens: [] };
  const sender: ReminderNotificationSender & { calls: typeof calls } = {
    calls,
    sendAppointmentReminder: vi.fn(async (record, manageToken: string) => {
      calls.customer.push(record);
      calls.reminderTokens.push(manageToken);
      return sendResult;
    }),
    sendInternalReminderSent: vi.fn(async (record) => {
      calls.internalSent.push(record);
      return { ok: true as const };
    }),
    sendInternalReminderFailed: vi.fn(async (record, attempts) => {
      calls.internalFailed.push([record, attempts]);
      return { ok: true as const };
    }),
  };
  return sender;
}

// Service start = 2026-06-15T12:00:00.000Z, 210-minute duration, +60min
// charge delay -> Scheduled Charge At = 2026-06-15T16:30:00.000Z. The
// reminder window opens 72h before service start.
const SERVICE_START = new Date("2026-06-15T12:00:00.000Z");
const DURATION_MINUTES = 210;
const SCHEDULED_CHARGE_AT = new Date(SERVICE_START.getTime() + (DURATION_MINUTES + 60) * 60_000).toISOString();
const DUE_AT = new Date(SERVICE_START.getTime() - 72 * 60 * 60 * 1000);
const WITHIN_WINDOW = new Date(DUE_AT.getTime() + 60 * 60 * 1000); // 71h before start
const BEFORE_WINDOW = new Date(DUE_AT.getTime() - 60 * 60 * 1000); // 73h before start
const AFTER_SERVICE_START = new Date(SERVICE_START.getTime() + 60 * 1000);

function activeBooking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return sampleBookingRecord({
    bookingId: "BELA-1",
    bookingStatus: "Pending Payment",
    scheduledChargeAt: SCHEDULED_CHARGE_AT,
    estimatedDurationMinutes: DURATION_MINUTES,
    appointmentReminderStatus: "",
    appointmentReminderSentAt: "",
    appointmentReminderAttempts: 0,
    ...overrides,
  });
}

describe("processReminderForBooking — eligibility", () => {
  it("returns not-found for an unknown booking ID", async () => {
    const repo = new FakeRepository();
    const result = await processReminderForBooking("BELA-MISSING", repo, fakeNotifications(), WITHIN_WINDOW);
    expect(result).toEqual({ bookingId: "BELA-MISSING", outcome: "not-found" });
  });

  it("skips a cancelled booking", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ bookingStatus: BOOKING_STATUS.CANCELLED }));
    const result = await processReminderForBooking("BELA-1", repo, fakeNotifications(), WITHIN_WINDOW);
    expect(result).toEqual({ bookingId: "BELA-1", outcome: "skipped-cancelled" });
  });

  it("skips a booking whose reminder was already Sent (no duplicate customer send)", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ appointmentReminderStatus: APPOINTMENT_REMINDER_STATUS.SENT }));
    const notifications = fakeNotifications();
    const result = await processReminderForBooking("BELA-1", repo, notifications, WITHIN_WINDOW);
    expect(result).toEqual({ bookingId: "BELA-1", outcome: "skipped-already-resolved", status: "Sent" });
    expect(notifications.sendAppointmentReminder).not.toHaveBeenCalled();
  });

  it("skips a booking whose reminder permanently Failed (no further attempts)", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ appointmentReminderStatus: APPOINTMENT_REMINDER_STATUS.FAILED, appointmentReminderAttempts: 3 }));
    const notifications = fakeNotifications();
    const result = await processReminderForBooking("BELA-1", repo, notifications, WITHIN_WINDOW);
    expect(result).toEqual({ bookingId: "BELA-1", outcome: "skipped-already-resolved", status: "Failed" });
    expect(notifications.sendAppointmentReminder).not.toHaveBeenCalled();
  });

  it("does not skip a booking in Retry Scheduled state — it remains eligible", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      activeBooking({ appointmentReminderStatus: APPOINTMENT_REMINDER_STATUS.RETRY_SCHEDULED, appointmentReminderAttempts: 1 }),
    );
    const result = await processReminderForBooking("BELA-1", repo, fakeNotifications(), WITHIN_WINDOW);
    expect(result.outcome).toBe("sent");
  });

  it("is not due more than 72 hours before service start", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const result = await processReminderForBooking("BELA-1", repo, fakeNotifications(), BEFORE_WINDOW);
    expect(result).toEqual({ bookingId: "BELA-1", outcome: "skipped-not-due" });
  });

  it("is not due once the service has already started", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const result = await processReminderForBooking("BELA-1", repo, fakeNotifications(), AFTER_SERVICE_START);
    expect(result).toEqual({ bookingId: "BELA-1", outcome: "skipped-not-due" });
  });

  it("independently re-derives and re-checks the window — never trusts the caller's due-claim", async () => {
    // Same as the "not due" cases above, but framed to make explicit that
    // this re-validation happens regardless of what Apps Script proposed.
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const result = await processReminderForBooking("BELA-1", repo, fakeNotifications(), BEFORE_WINDOW);
    expect(result.outcome).toBe("skipped-not-due");
  });
});

describe("processReminderForBooking — successful send", () => {
  it("sends the customer reminder, records Sent + Sent At + attempt 1, and sends an internal confirmation", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const notifications = fakeNotifications();

    const result = await processReminderForBooking("BELA-1", repo, notifications, WITHIN_WINDOW);

    expect(result).toEqual({ bookingId: "BELA-1", outcome: "sent", attempt: 1 });
    expect(notifications.sendAppointmentReminder).toHaveBeenCalledTimes(1);
    expect(notifications.sendInternalReminderSent).toHaveBeenCalledTimes(1);
    const record = repo.records.get("BELA-1");
    expect(record?.appointmentReminderStatus).toBe("Sent");
    expect(record?.appointmentReminderAttempts).toBe(1);
    expect(record?.appointmentReminderSentAt).toBe(formatOperationalTimestamp(WITHIN_WINDOW));
  });

  it("Milestone 6 amendment: ensures a successful send immediately makes subsequent scheduler runs ineligible", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const notifications = fakeNotifications();

    await processReminderForBooking("BELA-1", repo, notifications, WITHIN_WINDOW);
    const second = await processReminderForBooking("BELA-1", repo, notifications, new Date(WITHIN_WINDOW.getTime() + 60 * 60 * 1000));

    expect(second.outcome).toBe("skipped-already-resolved");
    expect(notifications.sendAppointmentReminder).toHaveBeenCalledTimes(1);
  });
});

describe("processReminderForBooking — bounded retry policy", () => {
  it("a transient failure with attempts remaining is retry-scheduled, not permanently failed, and does not alert BeLa yet", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const notifications = fakeNotifications({ ok: false, error: "Gmail API request failed with status 500." });

    const result = await processReminderForBooking("BELA-1", repo, notifications, WITHIN_WINDOW);

    expect(result).toEqual({ bookingId: "BELA-1", outcome: "retry-scheduled", attempt: 1 });
    const record = repo.records.get("BELA-1");
    expect(record?.appointmentReminderStatus).toBe("Retry Scheduled");
    expect(record?.appointmentReminderSentAt).toBe("");
    expect(notifications.sendInternalReminderFailed).not.toHaveBeenCalled();
  });

  it("a retry-scheduled booking is picked up again on the next eligible scheduler run", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ appointmentReminderStatus: "Retry Scheduled", appointmentReminderAttempts: 1 }));
    const notifications = fakeNotifications({ ok: false, error: "still failing" });

    const result = await processReminderForBooking("BELA-1", repo, notifications, WITHIN_WINDOW);

    expect(result).toEqual({ bookingId: "BELA-1", outcome: "retry-scheduled", attempt: 2 });
  });

  it(`after the ${MAX_REMINDER_ATTEMPTS}rd failed attempt, marks permanently Failed and alerts BeLa internally`, async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ appointmentReminderStatus: "Retry Scheduled", appointmentReminderAttempts: MAX_REMINDER_ATTEMPTS - 1 }));
    const notifications = fakeNotifications({ ok: false, error: "still failing" });

    const result = await processReminderForBooking("BELA-1", repo, notifications, WITHIN_WINDOW);

    expect(result).toEqual({ bookingId: "BELA-1", outcome: "failed-permanently", attempt: MAX_REMINDER_ATTEMPTS });
    const record = repo.records.get("BELA-1");
    expect(record?.appointmentReminderStatus).toBe("Failed");
    expect(record?.appointmentReminderSentAt).toBe("");
    expect(notifications.sendInternalReminderFailed).toHaveBeenCalledTimes(1);
    expect(notifications.calls.internalFailed[0]).toEqual([record, MAX_REMINDER_ATTEMPTS]);
  });

  it("never re-attempts a permanently Failed booking on a later scheduler run (no repeated customer spam)", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ appointmentReminderStatus: "Failed", appointmentReminderAttempts: MAX_REMINDER_ATTEMPTS }));
    const notifications = fakeNotifications();

    const result = await processReminderForBooking("BELA-1", repo, notifications, WITHIN_WINDOW);

    expect(result.outcome).toBe("skipped-already-resolved");
    expect(notifications.sendAppointmentReminder).not.toHaveBeenCalled();
  });
});

describe("processReminderForBooking — Manage Booking token (post-verification fix)", () => {
  it("mints a plausible, high-entropy raw token and passes it to the reminder email (a functional Manage Booking link)", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const notifications = fakeNotifications();

    await processReminderForBooking("BELA-1", repo, notifications, WITHIN_WINDOW);

    const [rawToken] = notifications.calls.reminderTokens as string[];
    expect(rawToken).toBeTruthy();
    expect(isPlausibleManageToken(rawToken)).toBe(true);
  });

  it("persists only the token's SHA-256 hash, never the raw value, in the reminder token column", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const notifications = fakeNotifications();

    await processReminderForBooking("BELA-1", repo, notifications, WITHIN_WINDOW);

    const [rawToken] = notifications.calls.reminderTokens as string[];
    const record = repo.records.get("BELA-1");
    expect(record?.manageBookingReminderTokenHash).toBe(hashManageToken(rawToken));
    // The raw token itself must never appear as a persisted field value.
    for (const value of Object.values(record ?? {})) {
      if (typeof value === "string") expect(value).not.toBe(rawToken);
    }
  });

  it("still persists a hash (never the raw token) even when the send attempt fails", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const notifications = fakeNotifications({ ok: false, error: "Gmail API request failed with status 500." });

    await processReminderForBooking("BELA-1", repo, notifications, WITHIN_WINDOW);

    const [rawToken] = notifications.calls.reminderTokens as string[];
    const record = repo.records.get("BELA-1");
    expect(record?.appointmentReminderStatus).toBe("Retry Scheduled");
    expect(record?.manageBookingReminderTokenHash).toBe(hashManageToken(rawToken));
  });

  it("does not touch the original Manage Booking Token Hash — only the dedicated reminder column is written", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ manageBookingTokenHash: "original-hash-unchanged" }));
    const notifications = fakeNotifications();

    await processReminderForBooking("BELA-1", repo, notifications, WITHIN_WINDOW);

    expect(repo.records.get("BELA-1")?.manageBookingTokenHash).toBe("original-hash-unchanged");
  });

  it("mints a fresh, different token on each retry attempt — bounded to one currently-valid reminder token, not unbounded growth", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const failing = fakeNotifications({ ok: false, error: "still failing" });

    await processReminderForBooking("BELA-1", repo, failing, WITHIN_WINDOW);
    const firstHash = repo.records.get("BELA-1")?.manageBookingReminderTokenHash;

    await processReminderForBooking("BELA-1", repo, failing, new Date(WITHIN_WINDOW.getTime() + 60 * 60 * 1000));
    const secondHash = repo.records.get("BELA-1")?.manageBookingReminderTokenHash;

    const [firstRawToken, secondRawToken] = failing.calls.reminderTokens as string[];
    expect(firstRawToken).not.toBe(secondRawToken);
    expect(firstHash).not.toBe(secondHash);
    // Exactly one column value at a time — the second attempt's hash is
    // what's currently stored, the first attempt's hash is superseded,
    // never appended alongside it.
    expect(repo.records.get("BELA-1")?.manageBookingReminderTokenHash).toBe(secondHash);
  });

  it("does not mint a token or send anything for a booking that is not due (idempotency preserved for skipped runs)", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const notifications = fakeNotifications();

    await processReminderForBooking("BELA-1", repo, notifications, BEFORE_WINDOW);

    expect(notifications.sendAppointmentReminder).not.toHaveBeenCalled();
    expect(repo.records.get("BELA-1")?.manageBookingReminderTokenHash).toBe("");
  });
});

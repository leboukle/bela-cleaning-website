import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./settings", () => ({ getBookingSettings: vi.fn() }));
vi.mock("./stripe/paymentIntent", () => ({ createOffSessionPaymentIntent: vi.fn() }));

import { getBookingSettings } from "./settings";
import { createOffSessionPaymentIntent } from "./stripe/paymentIntent";
import { cancelBookingByToken, type CancellationNotificationSender } from "./cancellationService";
import { hashManageToken } from "./manageToken";
import { PAYMENT_STATUS } from "./bookingsSheetSchema";
import { sampleBookingRecord } from "./testFixtures";
import type { BookingRepository, IdempotentBookingResult } from "./repository";
import type {
  AppointmentReminderUpdate,
  BookingCancellationInitiateUpdate,
  BookingPaymentState,
  BookingRecord,
  BookingReminderState,
  BookingRescheduleUpdate,
  CancellationFeeOutcomeUpdate,
  PaymentAttemptUpdate,
} from "./types";

const mockedGetSettings = vi.mocked(getBookingSettings);
const mockedCreatePaymentIntent = vi.mocked(createOffSessionPaymentIntent);

const SETTINGS = { minimumLeadDays: 7, defaultDailyCapacity: 2, timezone: "America/New_York", schemaVersion: 1 };
const RAW_TOKEN = "test-raw-token-value-1234567890";
const TOKEN_HASH = hashManageToken(RAW_TOKEN);

class FakeRepository implements BookingRepository {
  records = new Map<string, BookingRecord>();
  markCancelledCalls: Array<{ bookingId: string; update: BookingCancellationInitiateUpdate }> = [];
  feeOutcomeCalls: Array<{ bookingId: string; update: CancellationFeeOutcomeUpdate }> = [];

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

  async getFullBookingRecord(bookingId: string): Promise<BookingRecord | null> {
    return this.records.get(bookingId) ?? null;
  }

  async findBookingIdByManageTokenHash(tokenHash: string): Promise<string | null> {
    for (const record of this.records.values()) {
      if (record.manageBookingTokenHash === tokenHash) return record.bookingId;
    }
    return null;
  }

  async markBookingCancelled(bookingId: string, update: BookingCancellationInitiateUpdate): Promise<void> {
    this.markCancelledCalls.push({ bookingId, update });
    const record = this.records.get(bookingId);
    if (!record) throw new Error("Booking ID not found.");
    record.bookingStatus = "Cancelled";
    record.paymentStatus = update.paymentStatus;
    record.cancelledAt = update.cancelledAt;
    record.cancellationFeeAmount = update.cancellationFeeAmount;
  }

  async updateCancellationFeeOutcome(bookingId: string, update: CancellationFeeOutcomeUpdate): Promise<void> {
    this.feeOutcomeCalls.push({ bookingId, update });
    const record = this.records.get(bookingId);
    if (!record) throw new Error("Booking ID not found.");
    record.paymentStatus = update.paymentStatus;
    record.stripePaymentIntentId = update.stripePaymentIntentId;
    record.paidAt = update.paidAt;
  }

  async updateBookingReschedule(bookingId: string, update: BookingRescheduleUpdate): Promise<void> {
    const record = this.records.get(bookingId);
    if (!record) throw new Error("Booking ID not found.");
    Object.assign(record, {
      serviceDate: update.serviceDate,
      arrivalWindow: update.arrivalWindow,
      scheduledChargeAt: update.scheduledChargeAt,
      rescheduledAt: update.rescheduledAt,
      originalServiceDate: update.originalServiceDate,
      originalArrivalWindow: update.originalArrivalWindow,
      serviceStartTime: update.serviceStartTime,
      originalServiceStartTime: update.originalServiceStartTime,
    });
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
    const record = this.records.get(bookingId);
    if (!record) throw new Error("Booking ID not found.");
    record.appointmentReminderStatus = update.appointmentReminderStatus;
    record.appointmentReminderSentAt = update.appointmentReminderSentAt;
    record.appointmentReminderAttempts = update.appointmentReminderAttempts;
  }
}

function fakeNotifications(): CancellationNotificationSender & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { free: [], late: [], internal: [], internalFeeFailed: [] };
  return {
    calls,
    sendFreeCancellationConfirmation: vi.fn(async (record) => {
      calls.free.push(record);
      return { ok: true as const };
    }),
    sendLateCancellationConfirmation: vi.fn(async (record) => {
      calls.late.push(record);
      return { ok: true as const };
    }),
    sendInternalCancellationNotification: vi.fn(async (record, detail) => {
      calls.internal.push([record, detail]);
      return { ok: true as const };
    }),
    sendInternalCancellationFeeFailed: vi.fn(async (record, failure) => {
      calls.internalFeeFailed.push([record, failure]);
      return { ok: true as const };
    }),
  };
}

// Morning window, service date 2026-06-15 -> scheduled start 2026-06-15T12:00:00.000Z (8am EDT).
const SERVICE_DATE = "2026-06-15";
const SCHEDULED_START = new Date("2026-06-15T12:00:00.000Z");
const MORE_THAN_24H_BEFORE = new Date(SCHEDULED_START.getTime() - 25 * 60 * 60 * 1000);
const WITHIN_24H_BEFORE = new Date(SCHEDULED_START.getTime() - 2 * 60 * 60 * 1000);

function activeBooking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return sampleBookingRecord({
    bookingId: "BELA-1",
    bookingStatus: "Pending Payment",
    paymentStatus: PAYMENT_STATUS.SCHEDULED,
    serviceDate: SERVICE_DATE,
    arrivalWindow: "Morning",
    chargeAmount: 200,
    manageBookingTokenHash: TOKEN_HASH,
    stripeCustomerId: "cus_123",
    stripePaymentMethodId: "pm_456",
    ...overrides,
  });
}

beforeEach(() => {
  mockedGetSettings.mockReset().mockResolvedValue(SETTINGS);
  mockedCreatePaymentIntent.mockReset();
});

describe("cancelBookingByToken — token/auth", () => {
  it("an invalid token is rejected", async () => {
    const repo = new FakeRepository();
    const result = await cancelBookingByToken("not-a-real-token", repo, fakeNotifications());
    expect(result.outcome).toBe("invalid-token");
  });

  it("a well-formed but unrecognized token is rejected the same way", async () => {
    const repo = new FakeRepository();
    const result = await cancelBookingByToken(hashManageToken("x").padEnd(40, "a"), repo, fakeNotifications());
    expect(result.outcome).toBe("invalid-token");
  });

  it("a token cannot resolve to a different booking than the one it was minted for", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ bookingId: "BELA-1", manageBookingTokenHash: TOKEN_HASH }));
    repo.records.set("BELA-2", activeBooking({ bookingId: "BELA-2", manageBookingTokenHash: hashManageToken("a-different-token") }));

    const result = await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);
    expect(result.bookingId).toBe("BELA-1");
    expect(repo.records.get("BELA-2")?.bookingStatus).not.toBe("Cancelled");
  });
});

describe("cancelBookingByToken — free cancellation (>24h)", () => {
  it("cancels for free, marks Cancelled, no Stripe call, releases capacity implicitly (Booking Status alone)", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const notifications = fakeNotifications();

    const result = await cancelBookingByToken(RAW_TOKEN, repo, notifications, MORE_THAN_24H_BEFORE);

    expect(result.outcome).toBe("cancelled-free");
    expect(repo.records.get("BELA-1")?.bookingStatus).toBe("Cancelled");
    expect(repo.records.get("BELA-1")?.paymentStatus).toBe(PAYMENT_STATUS.CANCELLED_NO_CHARGE);
    expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
    expect(notifications.sendFreeCancellationConfirmation).toHaveBeenCalledTimes(1);
    expect(notifications.sendInternalCancellationNotification).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: cancelling an already-free-cancelled booking again is a safe no-op", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLED_NO_CHARGE }));
    const notifications = fakeNotifications();

    const result = await cancelBookingByToken(RAW_TOKEN, repo, notifications, MORE_THAN_24H_BEFORE);

    expect(result.outcome).toBe("already-cancelled-no-charge");
    expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
    expect(notifications.sendFreeCancellationConfirmation).not.toHaveBeenCalled();
  });

  it("the normal scheduled charge becomes impossible: Payment Status is never left at Scheduled", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);
    expect(repo.records.get("BELA-1")?.paymentStatus).not.toBe(PAYMENT_STATUS.SCHEDULED);
  });
});

describe("cancelBookingByToken — late cancellation boundary (exactly 24h and <24h)", () => {
  it("exactly 24 hours before start is treated as late", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    mockedCreatePaymentIntent.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_fee_1" });
    const exactly24h = new Date(SCHEDULED_START.getTime() - 24 * 60 * 60 * 1000);

    const result = await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), exactly24h);
    expect(result.outcome).toBe("cancelled-fee-initiated");
  });

  it("less than 24 hours before start is late", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    mockedCreatePaymentIntent.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_fee_1" });

    const result = await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE);
    expect(result.outcome).toBe("cancelled-fee-initiated");
    expect(repo.records.get("BELA-1")?.cancellationFeeAmount).toBe(100); // 50% of 200
  });
});

describe("cancelBookingByToken — late cancellation fee (<=24h)", () => {
  it("computes exactly 50% of the authoritative Charge Amount, never a client-supplied figure", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ chargeAmount: 190.5 }));
    mockedCreatePaymentIntent.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_fee_1" });

    await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE);

    expect(mockedCreatePaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 9525 })); // 50% of 190.50
    expect(repo.records.get("BELA-1")?.cancellationFeeAmount).toBe(95.25);
  });

  it("marks Cancelled before ever calling Stripe (order of operations)", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    mockedCreatePaymentIntent.mockImplementation(async () => {
      // By the time Stripe is "called," the booking must already be Cancelled.
      expect(repo.records.get("BELA-1")?.bookingStatus).toBe("Cancelled");
      return { outcome: "succeeded", paymentIntentId: "pi_fee_1" };
    });

    await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE);
    expect(mockedCreatePaymentIntent).toHaveBeenCalledTimes(1);
  });

  it("creates exactly one PaymentIntent for a late cancellation, tagged as a cancellation fee", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    mockedCreatePaymentIntent.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_fee_1" });

    await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE);

    expect(mockedCreatePaymentIntent).toHaveBeenCalledTimes(1);
    expect(mockedCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ metadataType: "cancellation_fee", idempotencyKey: "cancel-fee:BELA-1" }),
    );
  });

  it("uses the deterministic cancel-fee idempotency key format", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-XYZ", activeBooking({ bookingId: "BELA-XYZ" }));
    mockedCreatePaymentIntent.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_fee_1" });

    await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE);
    expect(mockedCreatePaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "cancel-fee:BELA-XYZ" }));
  });
});

describe("cancelBookingByToken — recovery from a crash before the Stripe call", () => {
  it("a booking recorded Cancelled + Processing but with no PaymentIntent is recognized and recovered on the next call", async () => {
    const repo = new FakeRepository();
    // Simulates the exact crash window: the first write succeeded, the process died before ever calling Stripe.
    repo.records.set("BELA-1", activeBooking({ bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING, stripePaymentIntentId: "", cancellationFeeAmount: 100 }));
    mockedCreatePaymentIntent.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_recovered" });

    const result = await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE);

    expect(result.outcome).toBe("cancelled-fee-initiated");
    expect(result.paymentIntentId).toBe("pi_recovered");
    expect(mockedCreatePaymentIntent).toHaveBeenCalledTimes(1);
    // Recovery reuses the exact same deterministic key a fresh attempt would have used.
    expect(mockedCreatePaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "cancel-fee:BELA-1" }));
  });

  it("a repeated recovery request is safe and does not create a second PaymentIntent once one exists", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING, stripePaymentIntentId: "", cancellationFeeAmount: 100 }));
    mockedCreatePaymentIntent.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_recovered" });

    await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE);
    // Second call: the record now has a PaymentIntent ID recorded, so this must not call Stripe again.
    const secondResult = await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE);

    expect(secondResult.outcome).toBe("fee-processing");
    expect(mockedCreatePaymentIntent).toHaveBeenCalledTimes(1);
  });

  it("a booking with a PaymentIntent already recorded is left alone (deferred to the webhook), never re-submitted", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING, stripePaymentIntentId: "pi_already_exists" }));

    const result = await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE);

    expect(result).toEqual({ outcome: "fee-processing", bookingId: "BELA-1", paymentIntentId: "pi_already_exists" });
    expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
  });

  it("a booking whose cancellation fee already succeeded is left alone", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PAID, stripePaymentIntentId: "pi_paid" }));

    const result = await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE);

    expect(result.outcome).toBe("fee-already-paid");
    expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
  });

  it("a booking whose cancellation fee already failed is left alone (no automatic retry)", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_FAILED }));

    const result = await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE);

    expect(result.outcome).toBe("fee-already-failed");
    expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
  });

  it("duplicate near-simultaneous cancel requests cannot double-charge — Stripe's idempotency key is reused identically", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    mockedCreatePaymentIntent.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_fee_1" });

    const [first, second] = await Promise.all([
      cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE),
      cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE),
    ]);

    // Both calls used (or would use) the exact same deterministic key —
    // real double-charge prevention is Stripe's own idempotency guarantee
    // on that key, which this asserts is truly identical every time.
    for (const call of mockedCreatePaymentIntent.mock.calls) {
      expect(call[0].idempotencyKey).toBe("cancel-fee:BELA-1");
    }
    expect([first.outcome, second.outcome]).toContain("cancelled-fee-initiated");
  });
});

describe("cancelBookingByToken — cancellation-fee submission failure (no PaymentIntent ever created)", () => {
  it("resolves to Cancellation Fee Failed, notifies BeLa, and preserves Cancelled status", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    mockedCreatePaymentIntent.mockResolvedValue({ outcome: "failed", paymentIntentId: null, error: { type: "api_error", code: null, declineCode: null } });
    const notifications = fakeNotifications();

    const result = await cancelBookingByToken(RAW_TOKEN, repo, notifications, WITHIN_24H_BEFORE);

    expect(result.outcome).toBe("cancelled-fee-submission-failed");
    expect(repo.records.get("BELA-1")?.bookingStatus).toBe("Cancelled");
    expect(repo.records.get("BELA-1")?.paymentStatus).toBe(PAYMENT_STATUS.CANCELLATION_FEE_FAILED);
    expect(notifications.sendInternalCancellationFeeFailed).toHaveBeenCalledTimes(1);
  });

  it("never leaves the booking eligible for the normal post-cleaning charge afterward", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    mockedCreatePaymentIntent.mockResolvedValue({ outcome: "failed", paymentIntentId: null, error: { type: "api_error", code: null, declineCode: null } });

    await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), WITHIN_24H_BEFORE);

    const finalRecord = repo.records.get("BELA-1");
    expect(finalRecord?.bookingStatus).toBe("Cancelled");
    expect(finalRecord?.paymentStatus).not.toBe(PAYMENT_STATUS.SCHEDULED);
  });
});

describe("cancelBookingByToken — not eligible", () => {
  it("rejects cancellation once the normal charge has already succeeded (appointment already occurred)", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ paymentStatus: PAYMENT_STATUS.PAID }));

    const result = await cancelBookingByToken(RAW_TOKEN, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);
    expect(result.outcome).toBe("not-eligible");
  });
});

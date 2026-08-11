import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./stripe/paymentIntent", () => ({ createOffSessionPaymentIntent: vi.fn() }));

import { createOffSessionPaymentIntent } from "./stripe/paymentIntent";
import { processDueBooking, type PaymentAttemptNotificationSender } from "./paymentProcessingService";
import { BOOKING_STATUS, PAYMENT_STATUS } from "./bookingsSheetSchema";
import type { BookingRepository, IdempotentBookingResult } from "./repository";
import type { BookingPaymentState, BookingRecord, PaymentAttemptUpdate } from "./types";
import { sampleBookingRecord } from "./testFixtures";

const mockedCreatePaymentIntent = vi.mocked(createOffSessionPaymentIntent);

class FakeRepository implements BookingRepository {
  states = new Map<string, BookingPaymentState>();
  records = new Map<string, BookingRecord>();
  updates: Array<{ bookingId: string; update: PaymentAttemptUpdate }> = [];

  async appendBooking(): Promise<void> {}
  async bookingIdExists(): Promise<boolean> {
    return false;
  }
  async findRecentBookingByIdempotencyToken(): Promise<IdempotentBookingResult | null> {
    return null;
  }
  async updateNotificationStatus(): Promise<void> {}

  async getBookingPaymentState(bookingId: string): Promise<BookingPaymentState | null> {
    return this.states.get(bookingId) ?? null;
  }

  async updatePaymentAttempt(bookingId: string, update: PaymentAttemptUpdate): Promise<void> {
    this.updates.push({ bookingId, update });
    const state = this.states.get(bookingId);
    if (state) {
      state.paymentStatus = update.paymentStatus;
      state.paymentAttemptCount = update.paymentAttemptCount;
      state.nextPaymentAttemptAt = update.nextPaymentAttemptAt;
    }
  }

  async getFullBookingRecord(bookingId: string): Promise<BookingRecord | null> {
    return this.records.get(bookingId) ?? null;
  }
}

function baseState(overrides: Partial<BookingPaymentState> = {}): BookingPaymentState {
  return {
    bookingId: "BELA-20260101-ABCDEF",
    bookingStatus: BOOKING_STATUS.PENDING_PAYMENT,
    paymentStatus: PAYMENT_STATUS.SCHEDULED,
    serviceDate: "2026-02-15",
    stripeCustomerId: "cus_123",
    stripePaymentMethodId: "pm_456",
    scheduledChargeAt: "2026-02-15T18:00:00.000Z",
    originalBookingTotal: 190.5,
    chargeAmount: 190.5,
    paymentAttemptCount: 0,
    nextPaymentAttemptAt: "",
    manualAmountOverride: false,
    ...overrides,
  };
}

function fakeNotifications(): PaymentAttemptNotificationSender & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    sendInternalPaymentFailed: vi.fn(async (...args: unknown[]) => {
      calls.push(args);
      return { ok: true as const };
    }),
  };
}

const NOW = new Date("2026-02-15T19:00:00.000Z"); // after the 18:00Z Scheduled Charge At above

beforeEach(() => {
  mockedCreatePaymentIntent.mockReset();
});

describe("processDueBooking", () => {
  it("returns not-found when the booking ID doesn't exist", async () => {
    const repo = new FakeRepository();
    const result = await processDueBooking("BELA-MISSING", repo, fakeNotifications(), NOW);
    expect(result).toEqual({ bookingId: "BELA-MISSING", outcome: "not-found" });
  });

  it("skips a Cancelled booking without touching Stripe", async () => {
    const repo = new FakeRepository();
    repo.states.set("BELA-1", baseState({ bookingId: "BELA-1", bookingStatus: BOOKING_STATUS.CANCELLED }));
    const result = await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);
    expect(result).toEqual({ bookingId: "BELA-1", outcome: "skipped-cancelled" });
    expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
  });

  it("skips a booking whose Payment Status isn't Scheduled or Retry Scheduled", async () => {
    const repo = new FakeRepository();
    repo.states.set("BELA-1", baseState({ bookingId: "BELA-1", paymentStatus: PAYMENT_STATUS.PAID }));
    const result = await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);
    expect(result).toEqual({ bookingId: "BELA-1", outcome: "skipped-not-due", paymentStatus: PAYMENT_STATUS.PAID });
    expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
  });

  it("skips a Scheduled booking whose Scheduled Charge At is still in the future", async () => {
    const repo = new FakeRepository();
    repo.states.set("BELA-1", baseState({ bookingId: "BELA-1", scheduledChargeAt: "2026-02-16T18:00:00.000Z" }));
    const result = await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);
    expect(result).toEqual({ bookingId: "BELA-1", outcome: "skipped-not-yet-due" });
    expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
  });

  it("marks Processing, calls Stripe with a deterministic idempotency key, and defers to the webhook on success", async () => {
    const repo = new FakeRepository();
    repo.states.set("BELA-1", baseState({ bookingId: "BELA-1" }));
    mockedCreatePaymentIntent.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_123" });

    const result = await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);

    expect(result).toEqual({ bookingId: "BELA-1", outcome: "charge-initiated", paymentIntentId: "pi_123", stripeOutcome: "succeeded" });
    expect(mockedCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cus_123", paymentMethodId: "pm_456", amountCents: 19050, idempotencyKey: "charge:BELA-1:attempt:1" }),
    );
    // First write marks Processing before calling Stripe; second confirms the PI id — never a terminal status.
    expect(repo.updates.length).toBe(2);
    expect(repo.updates[0].update.paymentStatus).toBe(PAYMENT_STATUS.PROCESSING);
    expect(repo.updates[1].update.stripePaymentIntentId).toBe("pi_123");
    expect(repo.updates[1].update.paymentStatus).toBe(PAYMENT_STATUS.PROCESSING);
  });

  it("still defers to the webhook (charge-initiated) for a failed outcome that carries a real PaymentIntent ID", async () => {
    const repo = new FakeRepository();
    repo.states.set("BELA-1", baseState({ bookingId: "BELA-1" }));
    mockedCreatePaymentIntent.mockResolvedValue({
      outcome: "failed",
      paymentIntentId: "pi_789",
      error: { type: "card_error", code: "card_declined", declineCode: "insufficient_funds" },
    });

    const result = await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);
    expect(result).toEqual({ bookingId: "BELA-1", outcome: "charge-initiated", paymentIntentId: "pi_789", stripeOutcome: "failed" });
    expect(repo.updates[repo.updates.length - 1].update.paymentStatus).toBe(PAYMENT_STATUS.PROCESSING);
  });

  it("resolves Retry Scheduled and notifies BeLa itself when Stripe never produces a PaymentIntent at all", async () => {
    const repo = new FakeRepository();
    repo.states.set("BELA-1", baseState({ bookingId: "BELA-1" }));
    repo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    mockedCreatePaymentIntent.mockResolvedValue({
      outcome: "failed",
      paymentIntentId: null,
      error: { type: "api_error", code: null, declineCode: null }, // classifies as retryable
    });
    const notifications = fakeNotifications();

    const result = await processDueBooking("BELA-1", repo, notifications, NOW);

    expect(result).toEqual({ bookingId: "BELA-1", outcome: "failed-terminal", paymentStatus: PAYMENT_STATUS.RETRY_SCHEDULED });
    const finalUpdate = repo.updates[repo.updates.length - 1].update;
    expect(finalUpdate.paymentStatus).toBe(PAYMENT_STATUS.RETRY_SCHEDULED);
    expect(finalUpdate.nextPaymentAttemptAt).not.toBe("");
    expect(notifications.sendInternalPaymentFailed).toHaveBeenCalledTimes(1);
  });
});

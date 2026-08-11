import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { handlePaymentIntentFailed, handlePaymentIntentSucceeded, type PaymentWebhookNotificationSender } from "./paymentWebhookService";
import { PAYMENT_STATUS } from "./bookingsSheetSchema";
import type { BookingRepository, IdempotentBookingResult } from "./repository";
import type { BookingPaymentState, BookingRecord, PaymentAttemptUpdate } from "./types";
import { sampleBookingRecord } from "./testFixtures";

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
      state.nextPaymentAttemptAt = update.nextPaymentAttemptAt;
    }
  }

  async getFullBookingRecord(bookingId: string): Promise<BookingRecord | null> {
    return this.records.get(bookingId) ?? null;
  }
}

function baseState(overrides: Partial<BookingPaymentState> = {}): BookingPaymentState {
  return {
    bookingId: "BELA-1",
    bookingStatus: "Pending Payment",
    paymentStatus: PAYMENT_STATUS.PROCESSING,
    serviceDate: "2026-02-15",
    stripeCustomerId: "cus_123",
    stripePaymentMethodId: "pm_456",
    scheduledChargeAt: "2026-02-15T18:00:00.000Z",
    originalBookingTotal: 190.5,
    chargeAmount: 190.5,
    paymentAttemptCount: 1,
    nextPaymentAttemptAt: "",
    manualAmountOverride: false,
    ...overrides,
  };
}

function fakeNotifications(): PaymentWebhookNotificationSender & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { receipt: [], internalSucceeded: [], internalFailed: [] };
  return {
    calls,
    sendPaymentReceipt: vi.fn(async (record) => {
      calls.receipt.push(record);
      return { ok: true as const };
    }),
    sendInternalPaymentSucceeded: vi.fn(async (record) => {
      calls.internalSucceeded.push(record);
      return { ok: true as const };
    }),
    sendInternalPaymentFailed: vi.fn(async (record, detail) => {
      calls.internalFailed.push([record, detail]);
      return { ok: true as const };
    }),
  };
}

function fakePaymentIntent(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return { id: "pi_123", metadata: { bookingId: "BELA-1" }, last_payment_error: null, ...overrides } as Stripe.PaymentIntent;
}

const NOW = new Date("2026-02-15T19:05:00.000Z");

describe("handlePaymentIntentSucceeded", () => {
  it("marks the booking Paid and sends both the receipt and internal success notification", async () => {
    const repo = new FakeRepository();
    repo.states.set("BELA-1", baseState());
    repo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const notifications = fakeNotifications();

    await handlePaymentIntentSucceeded(fakePaymentIntent(), repo, notifications, NOW);

    expect(repo.updates[0].update.paymentStatus).toBe(PAYMENT_STATUS.PAID);
    expect(repo.updates[0].update.paidAt).toBe(NOW.toISOString());
    expect(notifications.sendPaymentReceipt).toHaveBeenCalledTimes(1);
    expect(notifications.sendInternalPaymentSucceeded).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a redelivered event for an already-Paid booking does nothing further", async () => {
    const repo = new FakeRepository();
    repo.states.set("BELA-1", baseState({ paymentStatus: PAYMENT_STATUS.PAID }));
    repo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const notifications = fakeNotifications();

    await handlePaymentIntentSucceeded(fakePaymentIntent(), repo, notifications, NOW);

    expect(repo.updates.length).toBe(0);
    expect(notifications.sendPaymentReceipt).not.toHaveBeenCalled();
  });

  it("does nothing when the PaymentIntent has no bookingId in its metadata", async () => {
    const repo = new FakeRepository();
    const notifications = fakeNotifications();
    await handlePaymentIntentSucceeded(fakePaymentIntent({ metadata: {} }), repo, notifications, NOW);
    expect(repo.updates.length).toBe(0);
  });
});

describe("handlePaymentIntentFailed", () => {
  it("schedules a retry and notifies BeLa for a retryable decline", async () => {
    const repo = new FakeRepository();
    repo.states.set("BELA-1", baseState({ paymentAttemptCount: 1 }));
    repo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const notifications = fakeNotifications();

    const pi = fakePaymentIntent({
      last_payment_error: { type: "card_error", code: "card_declined", decline_code: "insufficient_funds" } as never,
    });
    await handlePaymentIntentFailed(pi, repo, notifications, NOW);

    expect(repo.updates[0].update.paymentStatus).toBe(PAYMENT_STATUS.RETRY_SCHEDULED);
    expect(repo.updates[0].update.nextPaymentAttemptAt).not.toBe("");
    expect(notifications.sendInternalPaymentFailed).toHaveBeenCalledTimes(1);
  });

  it("moves straight to Final Failure for a non-retryable decline, with no next attempt scheduled", async () => {
    const repo = new FakeRepository();
    repo.states.set("BELA-1", baseState({ paymentAttemptCount: 1 }));
    repo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const notifications = fakeNotifications();

    const pi = fakePaymentIntent({
      last_payment_error: { type: "card_error", code: "card_declined", decline_code: "stolen_card" } as never,
    });
    await handlePaymentIntentFailed(pi, repo, notifications, NOW);

    expect(repo.updates[0].update.paymentStatus).toBe(PAYMENT_STATUS.FINAL_FAILURE);
    expect(repo.updates[0].update.nextPaymentAttemptAt).toBe("");
    expect(notifications.sendInternalPaymentFailed).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a redelivered event for an attempt already resolved past Processing is a no-op", async () => {
    const repo = new FakeRepository();
    repo.states.set("BELA-1", baseState({ paymentStatus: PAYMENT_STATUS.RETRY_SCHEDULED }));
    repo.records.set("BELA-1", sampleBookingRecord({ bookingId: "BELA-1" }));
    const notifications = fakeNotifications();

    await handlePaymentIntentFailed(fakePaymentIntent(), repo, notifications, NOW);

    expect(repo.updates.length).toBe(0);
    expect(notifications.sendInternalPaymentFailed).not.toHaveBeenCalled();
  });
});

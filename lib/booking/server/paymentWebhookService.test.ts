import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { handlePaymentIntentFailed, handlePaymentIntentSucceeded, type PaymentWebhookNotificationSender } from "./paymentWebhookService";
import { PAYMENT_STATUS } from "./bookingsSheetSchema";
import { formatOperationalTimestamp } from "./dateUtils";
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

  async findBookingIdByManageTokenHash(tokenHash: string): Promise<string | null> {
    for (const record of this.records.values()) {
      if (record.manageBookingTokenHash === tokenHash) return record.bookingId;
    }
    return null;
  }

  async markBookingCancelled(bookingId: string, update: BookingCancellationInitiateUpdate): Promise<void> {
    const record = this.records.get(bookingId);
    if (!record) throw new Error("Booking ID not found.");
    record.bookingStatus = "Cancelled";
    record.paymentStatus = update.paymentStatus;
    record.cancelledAt = update.cancelledAt;
    record.cancellationFeeAmount = update.cancellationFeeAmount;
  }

  async updateCancellationFeeOutcome(bookingId: string, update: CancellationFeeOutcomeUpdate): Promise<void> {
    const record = this.records.get(bookingId);
    if (!record) throw new Error("Booking ID not found.");
    record.paymentStatus = update.paymentStatus;
    record.stripePaymentIntentId = update.stripePaymentIntentId;
    record.paidAt = update.paidAt;
  }

  async updateBookingReschedule(bookingId: string, update: BookingRescheduleUpdate): Promise<void> {
    const record = this.records.get(bookingId);
    if (!record) throw new Error("Booking ID not found.");
    record.serviceDate = update.serviceDate;
    record.arrivalWindow = update.arrivalWindow;
    record.scheduledChargeAt = update.scheduledChargeAt;
    record.rescheduledAt = update.rescheduledAt;
    record.originalServiceDate = update.originalServiceDate;
    record.originalArrivalWindow = update.originalArrivalWindow;
  }

  async getBookingReminderState(): Promise<BookingReminderState | null> {
    return null;
  }
  async updateAppointmentReminderStatus(_bookingId: string, _update: AppointmentReminderUpdate): Promise<void> {}
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
  const calls: Record<string, unknown[]> = { receipt: [], internalSucceeded: [], internalFailed: [], internalCancellationFeeFailed: [] };
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
    sendInternalCancellationFeeFailed: vi.fn(async (record, failure) => {
      calls.internalCancellationFeeFailed.push([record, failure]);
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
    expect(repo.updates[0].update.paidAt).toBe(formatOperationalTimestamp(NOW));
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

function fakeCancellationFeeIntent(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return fakePaymentIntent({ metadata: { bookingId: "BELA-1", type: "cancellation_fee" } as never, ...overrides });
}

describe("handlePaymentIntentSucceeded — cancellation fee", () => {
  it("marks the cancellation fee Paid, using the cancellation-fee path instead of the normal one", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      sampleBookingRecord({ bookingId: "BELA-1", bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING }),
    );
    const notifications = fakeNotifications();

    await handlePaymentIntentSucceeded(fakeCancellationFeeIntent(), repo, notifications, NOW);

    expect(repo.records.get("BELA-1")?.paymentStatus).toBe(PAYMENT_STATUS.CANCELLATION_FEE_PAID);
    expect(repo.records.get("BELA-1")?.paidAt).toBe(formatOperationalTimestamp(NOW));
    // Never routed through the normal-charge receipt/success notifications.
    expect(notifications.sendPaymentReceipt).not.toHaveBeenCalled();
    expect(notifications.sendInternalPaymentSucceeded).not.toHaveBeenCalled();
  });

  it("is idempotent: a redelivered event for an already-Paid cancellation fee is a no-op", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      sampleBookingRecord({ bookingId: "BELA-1", bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PAID }),
    );
    const notifications = fakeNotifications();

    await handlePaymentIntentSucceeded(fakeCancellationFeeIntent(), repo, notifications, NOW);

    expect(repo.records.get("BELA-1")?.paymentStatus).toBe(PAYMENT_STATUS.CANCELLATION_FEE_PAID);
  });
});

describe("handlePaymentIntentFailed — cancellation fee", () => {
  it("marks the cancellation fee Failed and notifies BeLa, with no retry scheduling", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      sampleBookingRecord({ bookingId: "BELA-1", bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING }),
    );
    const notifications = fakeNotifications();

    const pi = fakeCancellationFeeIntent({
      last_payment_error: { type: "card_error", code: "card_declined", decline_code: "insufficient_funds" } as never,
    });
    await handlePaymentIntentFailed(pi, repo, notifications, NOW);

    expect(repo.records.get("BELA-1")?.paymentStatus).toBe(PAYMENT_STATUS.CANCELLATION_FEE_FAILED);
    // The booking remains Cancelled either way — this handler never touches bookingStatus.
    expect(repo.records.get("BELA-1")?.bookingStatus).toBe("Cancelled");
    expect(notifications.sendInternalCancellationFeeFailed).toHaveBeenCalledTimes(1);
    // Never routed through the normal-charge failure notification, and no retry cadence applies.
    expect(notifications.sendInternalPaymentFailed).not.toHaveBeenCalled();
  });

  it("is idempotent: a redelivered event for an already-resolved cancellation fee is a no-op", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      sampleBookingRecord({ bookingId: "BELA-1", bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_FAILED }),
    );
    const notifications = fakeNotifications();

    await handlePaymentIntentFailed(fakeCancellationFeeIntent(), repo, notifications, NOW);

    expect(notifications.sendInternalCancellationFeeFailed).not.toHaveBeenCalled();
  });
});

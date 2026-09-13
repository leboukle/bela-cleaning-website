import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./stripe/paymentIntent", () => ({ createOffSessionPaymentIntent: vi.fn(), retrievePaymentIntent: vi.fn() }));

import { createOffSessionPaymentIntent, retrievePaymentIntent } from "./stripe/paymentIntent";
import { processDueBooking, type PaymentAttemptNotificationSender } from "./paymentProcessingService";
import { BOOKING_STATUS, PAYMENT_STATUS } from "./bookingsSheetSchema";
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

const mockedCreatePaymentIntent = vi.mocked(createOffSessionPaymentIntent);
const mockedRetrievePaymentIntent = vi.mocked(retrievePaymentIntent);

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
    bookingId: "BELA-20260101-ABCDEF",
    bookingStatus: BOOKING_STATUS.PENDING_PAYMENT,
    paymentStatus: PAYMENT_STATUS.SCHEDULED,
    serviceDate: "2026-02-15",
    stripeCustomerId: "cus_123",
    stripePaymentMethodId: "pm_456",
    stripePaymentIntentId: "",
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
  mockedRetrievePaymentIntent.mockReset();
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

  it("skips a stale Next Payment Attempt At on a booking whose Payment Status is already Paid — never touches Stripe", async () => {
    // Belt-and-suspenders regression test for the case where the Payment
    // Status field itself is correct (Paid) but Next Payment Attempt At
    // was never cleared for some other reason — the very first gate
    // (Scheduled/Retry Scheduled only) must reject this before ever
    // reaching the idempotency guard or Stripe.
    const repo = new FakeRepository();
    repo.states.set(
      "BELA-1",
      baseState({ bookingId: "BELA-1", paymentStatus: PAYMENT_STATUS.PAID, nextPaymentAttemptAt: "2020-01-01T00:00:00.000Z" }),
    );
    const result = await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);
    expect(result).toEqual({ bookingId: "BELA-1", outcome: "skipped-not-due", paymentStatus: PAYMENT_STATUS.PAID });
    expect(mockedRetrievePaymentIntent).not.toHaveBeenCalled();
    expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
  });

  describe("idempotency guard — already-succeeded PaymentIntent on file", () => {
    it("skips without charging Stripe again, and self-heals the Sheet to Paid, when the recorded PaymentIntent already succeeded", async () => {
      const repo = new FakeRepository();
      repo.states.set(
        "BELA-1",
        baseState({
          bookingId: "BELA-1",
          paymentStatus: PAYMENT_STATUS.RETRY_SCHEDULED,
          nextPaymentAttemptAt: "2026-02-15T18:30:00.000Z",
          stripePaymentIntentId: "pi_already_paid",
        }),
      );
      mockedRetrievePaymentIntent.mockResolvedValue({ id: "pi_already_paid", status: "succeeded" } as never);

      const result = await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);

      expect(result).toEqual({ bookingId: "BELA-1", outcome: "skipped-already-paid", paymentIntentId: "pi_already_paid" });
      expect(mockedRetrievePaymentIntent).toHaveBeenCalledWith("pi_already_paid");
      expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
      const update = repo.updates[repo.updates.length - 1].update;
      expect(update.paymentStatus).toBe(PAYMENT_STATUS.PAID);
      expect(update.nextPaymentAttemptAt).toBe("");
    });

    it("clears stale failure/retry fields on self-heal and never sends a failed-payment email, even with stale error metadata on file", async () => {
      // Simulates the exact reported scenario: a booking that previously
      // failed (leaving retry/error fields populated) subsequently
      // succeeded at Stripe, but the Sheet's Payment Status was never
      // updated past Retry Scheduled — e.g. a missed webhook delivery.
      const repo = new FakeRepository();
      repo.states.set(
        "BELA-1",
        baseState({
          bookingId: "BELA-1",
          paymentStatus: PAYMENT_STATUS.RETRY_SCHEDULED,
          paymentAttemptCount: 2,
          nextPaymentAttemptAt: "2026-02-15T18:30:00.000Z", // stale — already due
          stripePaymentIntentId: "pi_now_succeeded",
        }),
      );
      mockedRetrievePaymentIntent.mockResolvedValue({ id: "pi_now_succeeded", status: "succeeded" } as never);
      const notifications = fakeNotifications();

      const result = await processDueBooking("BELA-1", repo, notifications, NOW);

      expect(result.outcome).toBe("skipped-already-paid");
      expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
      expect(notifications.sendInternalPaymentFailed).not.toHaveBeenCalled();
      const update = repo.updates[repo.updates.length - 1].update;
      expect(update.paymentStatus).toBe(PAYMENT_STATUS.PAID);
      expect(update.nextPaymentAttemptAt).toBe("");
      expect(update.paymentFailureCode).toBe("");
    });

    it("converges Payment Status to the app's one canonical Paid value and leaves Booking Status alone (there is no separate 'Confirmed' status)", async () => {
      // This codebase's Booking Status column only ever distinguishes
      // "Pending Payment" from "Cancelled" (see BOOKING_STATUS) — there is
      // no third "Paid"/"Confirmed" value anywhere in the app, and the
      // authoritative webhook happy path (paymentWebhookService.ts) never
      // touches bookingStatus on success either. So a booking staying
      // "Pending Payment" alongside Payment Status: Paid is the existing,
      // correct converged state, not a bug — this self-heal path must
      // match that exactly rather than inventing a new status.
      const repo = new FakeRepository();
      repo.states.set(
        "BELA-1",
        baseState({
          bookingId: "BELA-1",
          bookingStatus: BOOKING_STATUS.PENDING_PAYMENT,
          paymentStatus: PAYMENT_STATUS.RETRY_SCHEDULED,
          nextPaymentAttemptAt: "2026-02-15T18:30:00.000Z",
          stripePaymentIntentId: "pi_now_succeeded",
        }),
      );
      mockedRetrievePaymentIntent.mockResolvedValue({ id: "pi_now_succeeded", status: "succeeded" } as never);

      await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);

      const finalState = repo.states.get("BELA-1")!;
      expect(finalState.paymentStatus).toBe(PAYMENT_STATUS.PAID);
      expect(finalState.bookingStatus).toBe(BOOKING_STATUS.PENDING_PAYMENT);
    });

    it("processes the same already-paid booking more than once without ever creating a second Stripe charge", async () => {
      const staleState = () =>
        baseState({
          bookingId: "BELA-1",
          paymentStatus: PAYMENT_STATUS.RETRY_SCHEDULED,
          nextPaymentAttemptAt: "2026-02-15T18:30:00.000Z",
          stripePaymentIntentId: "pi_already_paid",
        });
      mockedRetrievePaymentIntent.mockResolvedValue({ id: "pi_already_paid", status: "succeeded" } as never);

      const repoRunOne = new FakeRepository();
      repoRunOne.states.set("BELA-1", staleState());
      const resultOne = await processDueBooking("BELA-1", repoRunOne, fakeNotifications(), NOW);

      const repoRunTwo = new FakeRepository();
      repoRunTwo.states.set("BELA-1", staleState());
      const resultTwo = await processDueBooking("BELA-1", repoRunTwo, fakeNotifications(), NOW);

      expect(resultOne.outcome).toBe("skipped-already-paid");
      expect(resultTwo.outcome).toBe("skipped-already-paid");
      expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
    });

    it("proceeds with a normal retry attempt when Stripe has positively confirmed the existing PaymentIntent is a dead-end (requires_payment_method)", async () => {
      // "requires_payment_method" is Stripe's terminal status for a
      // PaymentIntent whose last attempt definitively failed and will
      // never succeed on its own — the one non-succeeded status (besides
      // "canceled") that positively clears the way for a brand-new
      // charge attempt.
      const repo = new FakeRepository();
      repo.states.set(
        "BELA-1",
        baseState({
          bookingId: "BELA-1",
          paymentStatus: PAYMENT_STATUS.RETRY_SCHEDULED,
          nextPaymentAttemptAt: "2026-02-15T18:30:00.000Z",
          stripePaymentIntentId: "pi_declined_before",
        }),
      );
      mockedRetrievePaymentIntent.mockResolvedValue({ id: "pi_declined_before", status: "requires_payment_method" } as never);
      mockedCreatePaymentIntent.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_new" });

      const result = await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);

      expect(mockedRetrievePaymentIntent).toHaveBeenCalledWith("pi_declined_before");
      expect(mockedCreatePaymentIntent).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ bookingId: "BELA-1", outcome: "charge-initiated", paymentIntentId: "pi_new", stripeOutcome: "succeeded" });
    });

    it("proceeds with a normal retry attempt when Stripe reports the existing PaymentIntent as canceled", async () => {
      const repo = new FakeRepository();
      repo.states.set(
        "BELA-1",
        baseState({
          bookingId: "BELA-1",
          paymentStatus: PAYMENT_STATUS.RETRY_SCHEDULED,
          nextPaymentAttemptAt: "2026-02-15T18:30:00.000Z",
          stripePaymentIntentId: "pi_canceled_before",
        }),
      );
      mockedRetrievePaymentIntent.mockResolvedValue({ id: "pi_canceled_before", status: "canceled" } as never);
      mockedCreatePaymentIntent.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_new" });

      const result = await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);

      expect(mockedCreatePaymentIntent).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ bookingId: "BELA-1", outcome: "charge-initiated", paymentIntentId: "pi_new", stripeOutcome: "succeeded" });
    });

    it("does NOT create another charge when the existing PaymentIntent is still in progress at Stripe (e.g. processing)", async () => {
      // A non-terminal status means the existing PaymentIntent could
      // still independently resolve to succeeded — creating a second one
      // here risks a real double charge. Must defer, not retry.
      const repo = new FakeRepository();
      repo.states.set(
        "BELA-1",
        baseState({
          bookingId: "BELA-1",
          paymentStatus: PAYMENT_STATUS.RETRY_SCHEDULED,
          nextPaymentAttemptAt: "2026-02-15T18:30:00.000Z",
          stripePaymentIntentId: "pi_still_processing",
        }),
      );
      mockedRetrievePaymentIntent.mockResolvedValue({ id: "pi_still_processing", status: "processing" } as never);

      const result = await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);

      expect(result).toEqual({
        bookingId: "BELA-1",
        outcome: "skipped-payment-intent-in-progress",
        paymentIntentId: "pi_still_processing",
        stripeStatus: "processing",
      });
      expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
      expect(repo.updates.length).toBe(0);
    });

    it("does NOT create another charge when the existing PaymentIntent requires customer action (requires_action)", async () => {
      const repo = new FakeRepository();
      repo.states.set(
        "BELA-1",
        baseState({
          bookingId: "BELA-1",
          paymentStatus: PAYMENT_STATUS.RETRY_SCHEDULED,
          nextPaymentAttemptAt: "2026-02-15T18:30:00.000Z",
          stripePaymentIntentId: "pi_requires_action",
        }),
      );
      mockedRetrievePaymentIntent.mockResolvedValue({ id: "pi_requires_action", status: "requires_action" } as never);

      const result = await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);

      expect(result.outcome).toBe("skipped-payment-intent-in-progress");
      expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
      expect(repo.updates.length).toBe(0);
    });

    it("fails CLOSED — does NOT create another charge — when the Stripe lookup itself throws/errors", async () => {
      // A transient Stripe/API/network error must never be treated as
      // "safe to charge again": that would turn a temporary outage into a
      // duplicate-charge opportunity. Must defer to a later scheduler run
      // that re-checks Stripe from scratch, not fall through to charging.
      const repo = new FakeRepository();
      repo.states.set(
        "BELA-1",
        baseState({
          bookingId: "BELA-1",
          paymentStatus: PAYMENT_STATUS.RETRY_SCHEDULED,
          nextPaymentAttemptAt: "2026-02-15T18:30:00.000Z",
          stripePaymentIntentId: "pi_lookup_error",
        }),
      );
      mockedRetrievePaymentIntent.mockResolvedValue(null);

      const result = await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);

      expect(result).toEqual({ bookingId: "BELA-1", outcome: "skipped-payment-intent-lookup-failed", paymentIntentId: "pi_lookup_error" });
      expect(mockedCreatePaymentIntent).not.toHaveBeenCalled();
      expect(repo.updates.length).toBe(0);
    });

    it("never consults Stripe when no PaymentIntent has been recorded yet (first attempt)", async () => {
      const repo = new FakeRepository();
      repo.states.set("BELA-1", baseState({ bookingId: "BELA-1" })); // stripePaymentIntentId: ""
      mockedCreatePaymentIntent.mockResolvedValue({ outcome: "succeeded", paymentIntentId: "pi_first" });

      await processDueBooking("BELA-1", repo, fakeNotifications(), NOW);

      expect(mockedRetrievePaymentIntent).not.toHaveBeenCalled();
    });
  });
});

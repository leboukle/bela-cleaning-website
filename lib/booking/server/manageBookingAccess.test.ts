import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./settings", () => ({ getBookingSettings: vi.fn() }));
vi.mock("./cancellationService", async () => {
  const actual = await vi.importActual<typeof import("./cancellationService")>("./cancellationService");
  return { ...actual, resolveCancellationFeeState: vi.fn() };
});

import { getBookingSettings } from "./settings";
import { resolveCancellationFeeState } from "./cancellationService";
import { getManageBookingView } from "./manageBookingAccess";
import { generateManageToken, hashManageToken } from "./manageToken";
import { PAYMENT_STATUS } from "./bookingsSheetSchema";
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

const mockedGetSettings = vi.mocked(getBookingSettings);
const mockedResolveFeeState = vi.mocked(resolveCancellationFeeState);

const SETTINGS = { minimumLeadDays: 7, defaultDailyCapacity: 2, timezone: "America/New_York", schemaVersion: 1 };
const RAW_TOKEN = generateManageToken();
const TOKEN_HASH = hashManageToken(RAW_TOKEN);

class FakeRepository implements BookingRepository {
  records = new Map<string, BookingRecord>();
  getFullBookingRecordCalls = 0;

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
  async getBookingReminderState(): Promise<BookingReminderState | null> {
    return null;
  }
  async updateAppointmentReminderStatus(_bookingId: string, _update: AppointmentReminderUpdate): Promise<void> {}

  async getFullBookingRecord(bookingId: string): Promise<BookingRecord | null> {
    this.getFullBookingRecordCalls += 1;
    return this.records.get(bookingId) ?? null;
  }

  async findBookingIdByManageTokenHash(tokenHash: string): Promise<string | null> {
    for (const record of this.records.values()) {
      if (record.manageBookingTokenHash === tokenHash) return record.bookingId;
    }
    return null;
  }

  async listAssignableBookings(): Promise<AssignableBookingSummary[]> {
    return [];
  }
  async markBookingCompleted(): Promise<void> {}
}

function fakeNotifications() {
  return {
    sendFreeCancellationConfirmation: vi.fn().mockResolvedValue({ ok: true }),
    sendLateCancellationConfirmation: vi.fn().mockResolvedValue({ ok: true }),
    sendInternalCancellationNotification: vi.fn().mockResolvedValue({ ok: true }),
    sendInternalCancellationFeeFailed: vi.fn().mockResolvedValue({ ok: true }),
  };
}

function activeBooking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return sampleBookingRecord({
    bookingId: "BELA-1",
    bookingStatus: "Pending Payment",
    paymentStatus: PAYMENT_STATUS.SCHEDULED,
    manageBookingTokenHash: TOKEN_HASH,
    ...overrides,
  });
}

beforeEach(() => {
  mockedGetSettings.mockReset().mockResolvedValue(SETTINGS);
  mockedResolveFeeState.mockReset();
});

describe("getManageBookingView", () => {
  it("rejects an implausible token without touching the repository", async () => {
    const repo = new FakeRepository();
    const result = await getManageBookingView("short", repo, fakeNotifications());
    expect(result).toEqual({ ok: false });
    expect(repo.getFullBookingRecordCalls).toBe(0);
  });

  it("rejects a well-formed token that matches no booking", async () => {
    const repo = new FakeRepository();
    const result = await getManageBookingView(RAW_TOKEN, repo, fakeNotifications());
    expect(result).toEqual({ ok: false });
  });

  it("returns the customer-safe view for a valid token", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());

    const result = await getManageBookingView(RAW_TOKEN, repo, fakeNotifications());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.bookingId).toBe("BELA-1");
    }
    expect(mockedResolveFeeState).not.toHaveBeenCalled();
  });

  it("attempts self-heal exactly for the recoverable state: Cancelled + Fee Processing + no PaymentIntent", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      activeBooking({
        bookingStatus: "Cancelled",
        paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING,
        stripePaymentIntentId: "",
      }),
    );
    mockedResolveFeeState.mockResolvedValue({ outcome: "cancelled-fee-initiated", bookingId: "BELA-1" });

    await getManageBookingView(RAW_TOKEN, repo, fakeNotifications());

    expect(mockedResolveFeeState).toHaveBeenCalledTimes(1);
    expect(mockedResolveFeeState).toHaveBeenCalledWith("BELA-1", repo, expect.anything(), expect.any(Date));
  });

  it("does NOT attempt self-heal when a PaymentIntent already exists (fee-processing, has PI)", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      activeBooking({
        bookingStatus: "Cancelled",
        paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING,
        stripePaymentIntentId: "pi_already_exists",
      }),
    );

    await getManageBookingView(RAW_TOKEN, repo, fakeNotifications());

    expect(mockedResolveFeeState).not.toHaveBeenCalled();
  });

  it("does NOT attempt self-heal for a booking that is not Cancelled", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());

    await getManageBookingView(RAW_TOKEN, repo, fakeNotifications());

    expect(mockedResolveFeeState).not.toHaveBeenCalled();
  });

  it("does NOT attempt self-heal for a terminal cancellation state (fee already paid/failed/free)", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      activeBooking({ bookingStatus: "Cancelled", paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PAID, stripePaymentIntentId: "pi_paid" }),
    );

    await getManageBookingView(RAW_TOKEN, repo, fakeNotifications());

    expect(mockedResolveFeeState).not.toHaveBeenCalled();
  });

  it("re-reads the record after a successful self-heal so the view reflects the recovered state", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      activeBooking({
        bookingStatus: "Cancelled",
        paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING,
        stripePaymentIntentId: "",
      }),
    );
    mockedResolveFeeState.mockImplementation(async (bookingId) => {
      const record = repo.records.get(bookingId as string);
      if (record) {
        record.paymentStatus = PAYMENT_STATUS.CANCELLATION_FEE_PAID;
        record.stripePaymentIntentId = "pi_recovered";
      }
      return { outcome: "cancelled-fee-initiated", bookingId: bookingId as string };
    });

    const result = await getManageBookingView(RAW_TOKEN, repo, fakeNotifications());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.displayStatus).toBe("Cancelled (late-cancellation fee charged)");
    }
  });

  it("a self-heal failure never breaks the page render — falls through to the pre-recovery state", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      activeBooking({
        bookingStatus: "Cancelled",
        paymentStatus: PAYMENT_STATUS.CANCELLATION_FEE_PROCESSING,
        stripePaymentIntentId: "",
      }),
    );
    mockedResolveFeeState.mockRejectedValue(new Error("Stripe unreachable"));

    const result = await getManageBookingView(RAW_TOKEN, repo, fakeNotifications());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.displayStatus).toBe("Cancelled (processing late-cancellation fee)");
    }
  });
});

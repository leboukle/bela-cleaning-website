import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./settings", () => ({ getBookingSettings: vi.fn() }));
vi.mock("./availability", () => ({ checkExactTimeAvailability: vi.fn() }));

import { getBookingSettings } from "./settings";
import { checkExactTimeAvailability, type ExactTimeAvailabilityResult } from "./availability";
import { rescheduleBookingByToken, type RescheduleNotificationSender } from "./reschedulingService";
import { hashManageToken } from "./manageToken";
import { arrivalWindowStartSpec, calculateServiceStart } from "./serviceTime";
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
const mockedCheckExactTimeAvailability = vi.mocked(checkExactTimeAvailability);

const SETTINGS = { minimumLeadDays: 7, defaultDailyCapacity: 2, timezone: "America/New_York", schemaVersion: 1 };
const AVAILABLE: ExactTimeAvailabilityResult = { available: true, reason: null, maxCapacity: 2, peakConcurrentCount: 1 };
const UNAVAILABLE: ExactTimeAvailabilityResult = { available: false, reason: "at-capacity", maxCapacity: 2, peakConcurrentCount: 3 };

const RAW_TOKEN = "test-raw-token-value-1234567890";
const TOKEN_HASH = hashManageToken(RAW_TOKEN);
const NEW_TIME = "14:00";

class FakeRepository implements BookingRepository {
  records = new Map<string, BookingRecord>();
  rescheduleCalls: Array<{ bookingId: string; update: BookingRescheduleUpdate }> = [];

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

  async getFullBookingRecord(bookingId: string): Promise<BookingRecord | null> {
    return this.records.get(bookingId) ?? null;
  }

  async findBookingIdByManageTokenHash(tokenHash: string): Promise<string | null> {
    for (const record of this.records.values()) {
      if (record.manageBookingTokenHash === tokenHash) return record.bookingId;
    }
    return null;
  }

  async updateBookingReschedule(bookingId: string, update: BookingRescheduleUpdate): Promise<void> {
    this.rescheduleCalls.push({ bookingId, update });
    const record = this.records.get(bookingId);
    if (!record) throw new Error("Booking ID not found.");
    Object.assign(record, update);
  }

  async getBookingReminderState(): Promise<BookingReminderState | null> {
    return null;
  }
  async updateAppointmentReminderStatus(_bookingId: string, _update: AppointmentReminderUpdate): Promise<void> {}
  async listAssignableBookings(): Promise<AssignableBookingSummary[]> {
    return [];
  }
  async markBookingCompleted(): Promise<void> {}
}

function fakeNotifications(): RescheduleNotificationSender & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { customer: [], internal: [] };
  return {
    calls,
    sendRescheduleConfirmation: vi.fn(async (record, change) => {
      calls.customer.push([record, change]);
      return { ok: true as const };
    }),
    sendInternalRescheduleNotification: vi.fn(async (record, change) => {
      calls.internal.push([record, change]);
      return { ok: true as const };
    }),
  };
}

// Dates are computed relative to the real system clock rather than
// hardcoded so these fixtures never go stale as real time passes.
// checkExactTimeAvailability is mocked in this file (both the current
// booking's >24h reschedule-eligibility check and the new target slot's
// own 24-hour minimum-lead-time check are fully controlled via the
// injected `now` below), so nothing here actually depends on real
// wall-clock time at assertion time — this is just future-dating the
// fixtures defensively.
function futureDateKey(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EARLIER_DATE = futureDateKey(20);
const ORIGINAL_DATE = futureDateKey(30);
const NEW_DATE = futureDateKey(60);
const SCHEDULED_START = calculateServiceStart(ORIGINAL_DATE, arrivalWindowStartSpec("morning"), SETTINGS.timezone);
const MORE_THAN_24H_BEFORE = new Date(SCHEDULED_START.getTime() - 25 * 60 * 60 * 1000);
const WITHIN_24H_BEFORE = new Date(SCHEDULED_START.getTime() - 2 * 60 * 60 * 1000);

// Legacy-shaped by default (Arrival Window populated, Service Start Time
// blank) — exercises the "backward compatible with pre-amendment rows"
// path through resolveRecordStartSpec unless a test overrides it to be
// exact-time-shaped instead.
function activeBooking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return sampleBookingRecord({
    bookingId: "BELA-1",
    bookingStatus: "Pending Payment",
    paymentStatus: PAYMENT_STATUS.SCHEDULED,
    serviceDate: ORIGINAL_DATE,
    arrivalWindow: "Morning",
    serviceStartTime: "",
    estimatedDurationMinutes: 210,
    manageBookingTokenHash: TOKEN_HASH,
    originalServiceDate: "",
    originalArrivalWindow: "",
    originalServiceStartTime: "",
    ...overrides,
  });
}

beforeEach(() => {
  mockedGetSettings.mockReset().mockResolvedValue(SETTINGS);
  mockedCheckExactTimeAvailability.mockReset().mockResolvedValue(AVAILABLE);
});

describe("rescheduleBookingByToken — timing", () => {
  it("more than 24h before start: reschedule allowed", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());

    const result = await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);
    expect(result.outcome).toBe("rescheduled");
  });

  it("24h or less before start: self-service reschedule is disabled", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());

    const result = await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), WITHIN_24H_BEFORE);
    expect(result.outcome).toBe("not-eligible");
    expect(mockedCheckExactTimeAvailability).not.toHaveBeenCalled();
  });
});

describe("rescheduleBookingByToken — availability", () => {
  it("validates the new date/time through the same authoritative overlap/capacity-aware availability service used by new bookings", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());

    await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);
    expect(mockedCheckExactTimeAvailability).toHaveBeenCalledWith(NEW_DATE, NEW_TIME, 210, MORE_THAN_24H_BEFORE);
  });

  it("an unavailable new slot leaves the existing booking completely untouched", async () => {
    const repo = new FakeRepository();
    const original = activeBooking();
    repo.records.set("BELA-1", { ...original });
    mockedCheckExactTimeAvailability.mockResolvedValue(UNAVAILABLE);

    const result = await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);

    expect(result.outcome).toBe("date-unavailable");
    expect(repo.records.get("BELA-1")).toEqual(original);
    expect(repo.rescheduleCalls.length).toBe(0);
  });

  it("rejects safely if the new slot becomes unavailable between the first check and the recheck", async () => {
    const repo = new FakeRepository();
    const original = activeBooking();
    repo.records.set("BELA-1", { ...original });
    mockedCheckExactTimeAvailability.mockResolvedValueOnce(AVAILABLE).mockResolvedValueOnce(UNAVAILABLE);

    const result = await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);

    expect(result.outcome).toBe("date-unavailable");
    expect(repo.records.get("BELA-1")).toEqual(original);
  });
});

describe("rescheduleBookingByToken — successful reschedule", () => {
  it("updates Service Date/Service Start Time, clears the legacy Arrival Window, and recalculates Scheduled Charge At", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());

    const result = await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);

    expect(result.outcome).toBe("rescheduled");
    const updated = repo.records.get("BELA-1");
    expect(updated?.serviceDate).toBe(NEW_DATE);
    expect(updated?.serviceStartTime).toBe(NEW_TIME);
    expect(updated?.arrivalWindow).toBe("");
    // New start + 210 min duration + 60 min charge delay, computed the
    // same DST-safe way scheduledCharge.test.ts already verifies directly
    // — asserted here via that same real calculation rather than a
    // hardcoded instant, since NEW_DATE is dynamic (DST status unknown
    // this far ahead without computing it).
    const expectedStart = calculateServiceStart(NEW_DATE, { hour: 14, minute: 0 }, SETTINGS.timezone);
    const expectedChargeAt = new Date(expectedStart.getTime() + (210 + 60) * 60_000);
    expect(updated?.scheduledChargeAt).toBe(expectedChargeAt.toISOString());
  });

  it("preserves the Stripe Customer/PaymentMethod and Booking ID", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ stripeCustomerId: "cus_keep", stripePaymentMethodId: "pm_keep" }));

    await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);

    const updated = repo.records.get("BELA-1");
    expect(updated?.bookingId).toBe("BELA-1");
    expect(updated?.stripeCustomerId).toBe("cus_keep");
    expect(updated?.stripePaymentMethodId).toBe("pm_keep");
  });

  it("captures Original Service Date/Arrival Window on the first reschedule of a legacy booking", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      activeBooking({ serviceDate: ORIGINAL_DATE, arrivalWindow: "Morning", serviceStartTime: "", originalServiceDate: "", originalArrivalWindow: "" }),
    );

    await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);

    const updated = repo.records.get("BELA-1");
    expect(updated?.originalServiceDate).toBe(ORIGINAL_DATE);
    expect(updated?.originalArrivalWindow).toBe("Morning");
    expect(updated?.originalServiceStartTime).toBe("");
  });

  it("captures Original Service Date/Service Start Time on the first reschedule of an already-exact-time booking", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      activeBooking({
        serviceDate: ORIGINAL_DATE,
        arrivalWindow: "",
        serviceStartTime: "09:00",
        originalServiceDate: "",
        originalArrivalWindow: "",
        originalServiceStartTime: "",
      }),
    );

    await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);

    const updated = repo.records.get("BELA-1");
    expect(updated?.originalServiceDate).toBe(ORIGINAL_DATE);
    expect(updated?.originalServiceStartTime).toBe("09:00");
    expect(updated?.originalArrivalWindow).toBe("");
  });

  it("never overwrites Original Service Date/Arrival Window on a second reschedule", async () => {
    const repo = new FakeRepository();
    repo.records.set(
      "BELA-1",
      activeBooking({
        serviceDate: ORIGINAL_DATE,
        arrivalWindow: "",
        serviceStartTime: "10:00", // this booking's current slot, set by its own first reschedule
        originalServiceDate: EARLIER_DATE,
        originalArrivalWindow: "Morning",
        originalServiceStartTime: "",
      }),
    );

    await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);

    const updated = repo.records.get("BELA-1");
    expect(updated?.originalServiceDate).toBe(EARLIER_DATE);
    expect(updated?.originalArrivalWindow).toBe("Morning");
    expect(updated?.serviceDate).toBe(NEW_DATE); // the current slot still moves
    expect(updated?.serviceStartTime).toBe(NEW_TIME);
  });

  it("old slot capacity is released and new slot capacity is reserved implicitly, by moving Service Date", async () => {
    // availability.ts counts live bookings by scanning current Service
    // Date + resolved start time/duration on every read — there is no
    // separate capacity counter to update, so a successful reschedule
    // reserving the new slot and releasing the old one is exactly this
    // one write.
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ serviceDate: ORIGINAL_DATE }));

    await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);

    const updated = repo.records.get("BELA-1");
    expect(updated?.serviceDate).not.toBe(ORIGINAL_DATE);
    expect(updated?.serviceDate).toBe(NEW_DATE);
  });

  it("sends both customer and internal reschedule confirmations with old/new date info", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ serviceDate: ORIGINAL_DATE, arrivalWindow: "Morning", serviceStartTime: "" }));
    const notifications = fakeNotifications();

    await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, notifications, MORE_THAN_24H_BEFORE);

    expect(notifications.sendRescheduleConfirmation).toHaveBeenCalledTimes(1);
    expect(notifications.sendInternalRescheduleNotification).toHaveBeenCalledTimes(1);
    const [, change] = notifications.calls.customer[0] as [
      BookingRecord,
      { oldServiceDate: string; oldArrivalWindow: string; oldServiceStartTime: string },
    ];
    expect(change).toEqual({ oldServiceDate: ORIGINAL_DATE, oldArrivalWindow: "Morning", oldServiceStartTime: "" });
  });

  it("a repeated identical reschedule request is safe (idempotent in effect — same new slot, re-validated each time)", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());

    const first = await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);
    const second = await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);

    expect(first.outcome).toBe("rescheduled");
    expect(second.outcome).toBe("rescheduled");
    expect(repo.records.get("BELA-1")?.serviceDate).toBe(NEW_DATE);
  });
});

describe("rescheduleBookingByToken — input validation and eligibility", () => {
  it("rejects an already-cancelled booking", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking({ bookingStatus: "Cancelled" }));
    const result = await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);
    expect(result.outcome).toBe("not-eligible");
  });

  it("rejects a malformed new service date without trusting client input", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const result = await rescheduleBookingByToken(RAW_TOKEN, "not-a-date", NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);
    expect(result.outcome).toBe("invalid-input");
    expect(mockedCheckExactTimeAvailability).not.toHaveBeenCalled();
  });

  it("rejects an out-of-catalog start time", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const result = await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, "not-a-time", repo, fakeNotifications(), MORE_THAN_24H_BEFORE);
    expect(result.outcome).toBe("invalid-input");
  });

  it("rejects a half-hour time not on the approved hourly catalog", async () => {
    const repo = new FakeRepository();
    repo.records.set("BELA-1", activeBooking());
    const result = await rescheduleBookingByToken(RAW_TOKEN, NEW_DATE, "14:30", repo, fakeNotifications(), MORE_THAN_24H_BEFORE);
    expect(result.outcome).toBe("invalid-input");
  });

  it("rejects an invalid token", async () => {
    const repo = new FakeRepository();
    const result = await rescheduleBookingByToken("bad-token", NEW_DATE, NEW_TIME, repo, fakeNotifications(), MORE_THAN_24H_BEFORE);
    expect(result.outcome).toBe("invalid-token");
  });
});

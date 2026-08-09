import { describe, it, expect, vi, beforeEach } from "vitest";

// settings/availability are mocked so these tests exercise bookingService's
// own sequencing logic without needing real Sheets I/O; validateSubmission,
// calculateAuthoritativePricing, generateBookingId, extras/sanitize, and the
// idempotency fast path all run for real (pure, no I/O) so the orchestration
// itself is genuinely tested, not just mocked end to end.
vi.mock("./settings", () => ({ getBookingSettings: vi.fn() }));
vi.mock("./availability", () => ({ checkDateAvailability: vi.fn() }));

import { getBookingSettings } from "./settings";
import { checkDateAvailability, type AvailabilityResult } from "./availability";
import { submitBooking, type NotificationSender } from "./bookingService";
import { resetIdempotencyFastPathForTests } from "./idempotency";
import type { BookingRepository, IdempotentBookingResult } from "./repository";
import type { BookingRecord, BookingSubmissionInput } from "./types";
import type { NotificationStatusUpdate } from "./notificationStatus";

const mockedGetSettings = vi.mocked(getBookingSettings);
const mockedCheckAvailability = vi.mocked(checkDateAvailability);

const SETTINGS = { minimumLeadDays: 7, defaultDailyCapacity: 2, timezone: "America/New_York", schemaVersion: 1 };
const AVAILABLE: AvailabilityResult = { available: true, reason: null, maxCapacity: 2, currentCount: 0 };
const UNAVAILABLE: AvailabilityResult = { available: false, reason: "at-capacity", maxCapacity: 2, currentCount: 2 };

class InMemoryBookingRepository implements BookingRepository {
  appended: BookingRecord[] = [];
  notificationStatusUpdates: Array<{ bookingId: string; update: NotificationStatusUpdate }> = [];
  private existingIds = new Set<string>();
  private tokenIndex = new Map<string, IdempotentBookingResult>();

  async appendBooking(record: BookingRecord): Promise<void> {
    this.appended.push(record);
    this.existingIds.add(record.bookingId);
    const marker = /idempotency_token:(\S+)/.exec(record.internalNotes)?.[1];
    if (marker) {
      this.tokenIndex.set(marker, {
        bookingId: record.bookingId,
        totalPrice: record.totalPrice,
        estimatedDurationMinutes: record.estimatedDurationMinutes,
        serviceDate: record.serviceDate,
        arrivalWindow: record.arrivalWindow,
      });
    }
  }

  async bookingIdExists(bookingId: string): Promise<boolean> {
    return this.existingIds.has(bookingId);
  }

  async findRecentBookingByIdempotencyToken(token: string): Promise<IdempotentBookingResult | null> {
    return this.tokenIndex.get(token) ?? null;
  }

  async updateNotificationStatus(bookingId: string, update: NotificationStatusUpdate): Promise<void> {
    this.notificationStatusUpdates.push({ bookingId, update });
    const record = this.appended.find((r) => r.bookingId === bookingId);
    if (record) {
      record.customerConfirmationStatus = update.customerConfirmationStatus;
      record.internalNotificationStatus = update.internalNotificationStatus;
      record.notificationAttemptAt = update.notificationAttemptAt;
    }
  }
}

function createFakeNotificationSender(): NotificationSender & {
  customerCalls: BookingRecord[];
  internalCalls: BookingRecord[];
} {
  const customerCalls: BookingRecord[] = [];
  const internalCalls: BookingRecord[] = [];
  return {
    customerCalls,
    internalCalls,
    sendCustomerBookingReceived: vi.fn(async (record: BookingRecord) => {
      customerCalls.push(record);
      return { ok: true as const };
    }),
    sendInternalNewBookingNotification: vi.fn(async (record: BookingRecord) => {
      internalCalls.push(record);
      return { ok: true as const };
    }),
  };
}

function futureDateKey(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function validInput(overrides: Partial<BookingSubmissionInput> = {}): BookingSubmissionInput {
  return {
    idempotencyToken: "default-token",
    honeypot: "",
    propertyType: "apartment",
    propertyTypeOther: "",
    squareFootage: "1001-2000",
    bedrooms: "2",
    bathrooms: "2",
    cleaningType: "standard",
    extras: {
      kitchenCabinets: false,
      refrigerator: false,
      oven: false,
      interiorWindowsQty: 0,
      blindsQty: 0,
      noExtras: true,
    },
    frequency: "one-time",
    zipCode: "07030",
    serviceDate: futureDateKey(30),
    arrivalWindow: "morning",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    phone: "5551234567",
    addressStreet: "123 Main St",
    addressUnit: "",
    addressCity: "Hoboken",
    addressState: "New Jersey",
    addressZip: "07030",
    someoneHome: "home",
    specialInstructions: "",
    agreedToPolicy: true,
    ...overrides,
  };
}

function sampleRecordWithToken(token: string): BookingRecord {
  return {
    bookingId: "BELA-20260901-PREEXIST",
    submittedAt: "2026-09-01T00:00:00.000Z",
    bookingStatus: "Pending Payment",
    paymentStatus: "Unpaid",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    mobile: "5551234567",
    streetAddress: "123 Main St",
    apartmentOrUnit: "",
    city: "Hoboken",
    state: "New Jersey",
    zipCode: "07030",
    someoneHome: "Yes, someone will be home",
    serviceDate: "2026-09-22",
    arrivalWindow: "Morning",
    propertyType: "Apartment",
    squareFootage: "1,001–2,000 sq. ft.",
    bedrooms: "2 bedrooms",
    bathrooms: "2 bathrooms",
    cleaningType: "Standard cleaning",
    extras: "none",
    frequency: "One time",
    baseCleaningPrice: 130,
    bathroomPrice: 20,
    cleaningTypePrice: 0,
    extrasPrice: 0,
    subtotal: 150,
    frequencyDiscount: 0,
    totalPrice: 150,
    estimatedDurationMinutes: 210,
    specialInstructions: "",
    policyAccepted: true,
    submissionSource: "Website",
    stripeCheckoutSessionId: "",
    stripePaymentIntentId: "",
    paidAt: "",
    cancelledAt: "",
    completedAt: "",
    internalNotes: `idempotency_token:${token}`,
    schemaVersion: 1,
    customerConfirmationStatus: "",
    internalNotificationStatus: "",
    notificationAttemptAt: "",
  };
}

beforeEach(() => {
  resetIdempotencyFastPathForTests();
  mockedGetSettings.mockReset().mockResolvedValue(SETTINGS);
  mockedCheckAvailability.mockReset().mockResolvedValue(AVAILABLE);
});

describe("submitBooking", () => {
  it("validates, prices, generates an ID, and appends exactly one Pending Payment / Unpaid row on the happy path", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    const result = await submitBooking(validInput({ idempotencyToken: "happy-token" }), repo, notifications);
    expect(result.ok).toBe(true);
    expect(repo.appended.length).toBe(1);
    const record = repo.appended[0];
    expect(record.bookingStatus).toBe("Pending Payment");
    expect(record.paymentStatus).toBe("Unpaid");
    expect(record.internalNotes).toBe("idempotency_token:happy-token");
    if (result.ok) {
      expect(result.bookingId).toBe(record.bookingId);
      expect(result.totalPrice).toBe(record.totalPrice);
    }
  });

  it("returns a validation failure and never touches availability or the repository", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    const result = await submitBooking(validInput({ email: "not-an-email" }), repo, notifications);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("validation");
    expect(mockedCheckAvailability).not.toHaveBeenCalled();
    expect(repo.appended.length).toBe(0);
  });

  it("treats a filled honeypot as a validation failure", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    const result = await submitBooking(validInput({ honeypot: "spam" }), repo, notifications);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("validation");
    expect(repo.appended.length).toBe(0);
  });

  it("returns date-unavailable and appends nothing when the date is already full", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    mockedCheckAvailability.mockResolvedValue(UNAVAILABLE);
    const result = await submitBooking(validInput({ idempotencyToken: "unavailable-token" }), repo, notifications);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("date-unavailable");
    expect(repo.appended.length).toBe(0);
  });

  it("returns the existing booking when the repository already has this idempotency token (authoritative dedupe)", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    await repo.appendBooking(sampleRecordWithToken("dupe-token"));
    const result = await submitBooking(validInput({ idempotencyToken: "dupe-token" }), repo, notifications);
    expect(result.ok).toBe(true);
    expect(repo.appended.length).toBe(1); // no new row appended
    expect(mockedCheckAvailability).not.toHaveBeenCalled();
  });

  it("only appends once when the same token is submitted concurrently", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    const token = "concurrent-token";
    const [a, b] = await Promise.all([
      submitBooking(validInput({ idempotencyToken: token }), repo, notifications),
      submitBooking(validInput({ idempotencyToken: token }), repo, notifications),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(repo.appended.length).toBe(1);
    if (a.ok && b.ok) expect(a.bookingId).toBe(b.bookingId);
  });

  it("retries booking ID generation once on a collision and still succeeds", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    let calls = 0;
    const originalExists = repo.bookingIdExists.bind(repo);
    repo.bookingIdExists = async (id: string) => {
      calls += 1;
      if (calls === 1) return true; // force a collision on the first candidate
      return originalExists(id);
    };
    const result = await submitBooking(validInput({ idempotencyToken: "collision-token" }), repo, notifications);
    expect(result.ok).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(repo.appended.length).toBe(1);
  });

  it("gives up after repeated booking ID collisions and reports a server error", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    repo.bookingIdExists = async () => true; // always collides
    const result = await submitBooking(validInput({ idempotencyToken: "exhausted-token" }), repo, notifications);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("server-error");
    expect(repo.appended.length).toBe(0);
  });

  it("rejects with date-unavailable if the recheck immediately before append finds the date now full", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    mockedCheckAvailability.mockResolvedValueOnce(AVAILABLE).mockResolvedValueOnce(UNAVAILABLE);
    const result = await submitBooking(validInput({ idempotencyToken: "recheck-token" }), repo, notifications);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("date-unavailable");
    expect(repo.appended.length).toBe(0);
  });

  it("reports a server error and never calls availability when settings can't be read", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    mockedGetSettings.mockReset().mockRejectedValue(new Error("sheet unreachable"));
    const result = await submitBooking(validInput(), repo, notifications);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("server-error");
    expect(repo.appended.length).toBe(0);
    expect(mockedCheckAvailability).not.toHaveBeenCalled();
  });

  it("reports a server error if the final append fails", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    repo.appendBooking = async () => {
      throw new Error("append failed");
    };
    const result = await submitBooking(validInput({ idempotencyToken: "append-fail-token" }), repo, notifications);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("server-error");
  });

  it("still returns a successful booking result when the customer confirmation email fails", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    notifications.sendCustomerBookingReceived = vi.fn(async () => ({ ok: false as const, error: "Gmail API request failed with status 500." }));
    const result = await submitBooking(validInput({ idempotencyToken: "customer-email-fail-token" }), repo, notifications);
    expect(result.ok).toBe(true);
    expect(repo.appended.length).toBe(1);
  });

  it("still returns a successful booking result when the internal notification email fails", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    notifications.sendInternalNewBookingNotification = vi.fn(async () => ({
      ok: false as const,
      error: "Missing required environment variable: BELA_INTERNAL_NOTIFICATION_EMAIL",
    }));
    const result = await submitBooking(validInput({ idempotencyToken: "internal-email-fail-token" }), repo, notifications);
    expect(result.ok).toBe(true);
    expect(repo.appended.length).toBe(1);
  });

  it("keeps the booking stored even when both notification emails fail", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    notifications.sendCustomerBookingReceived = vi.fn(async () => {
      throw new Error("network error");
    });
    notifications.sendInternalNewBookingNotification = vi.fn(async () => {
      throw new Error("network error");
    });
    const result = await submitBooking(validInput({ idempotencyToken: "both-emails-fail-token" }), repo, notifications);
    expect(result.ok).toBe(true);
    expect(repo.appended.length).toBe(1);
    expect(repo.appended[0].bookingId).toBe(result.ok ? result.bookingId : undefined);
  });

  it("sends exactly one customer email and one internal email per accepted booking, never duplicated on retry", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    const token = "no-duplicate-emails-token";
    const first = await submitBooking(validInput({ idempotencyToken: token }), repo, notifications);
    const second = await submitBooking(validInput({ idempotencyToken: token }), repo, notifications);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(repo.appended.length).toBe(1);
    expect(notifications.customerCalls.length).toBe(1);
    expect(notifications.internalCalls.length).toBe(1);
  });

  it("records both notification statuses as Sent, with a timestamp, when both emails succeed", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    await submitBooking(validInput({ idempotencyToken: "status-both-sent-token" }), repo, notifications);
    expect(repo.notificationStatusUpdates.length).toBe(1);
    const record = repo.appended[0];
    expect(record.customerConfirmationStatus).toBe("Sent");
    expect(record.internalNotificationStatus).toBe("Sent");
    expect(record.notificationAttemptAt).not.toBe("");
    expect(() => new Date(record.notificationAttemptAt).toISOString()).not.toThrow();
  });

  it("records the customer status as Failed (and internal as Sent) when only the customer email fails", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    notifications.sendCustomerBookingReceived = vi.fn(async () => ({ ok: false as const, error: "send failed" }));
    await submitBooking(validInput({ idempotencyToken: "status-customer-failed-token" }), repo, notifications);
    const record = repo.appended[0];
    expect(record.customerConfirmationStatus).toBe("Failed");
    expect(record.internalNotificationStatus).toBe("Sent");
  });

  it("still returns a successful booking result when recording the notification status itself fails", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    repo.updateNotificationStatus = async () => {
      throw new Error("sheet temporarily unavailable");
    };
    const result = await submitBooking(validInput({ idempotencyToken: "status-write-fail-token" }), repo, notifications);
    expect(result.ok).toBe(true);
    expect(repo.appended.length).toBe(1);
    // The columns simply stay blank (as set at append time) since the
    // status-write attempt itself failed — not treated as a booking failure.
    expect(repo.appended[0].customerConfirmationStatus).toBe("");
  });

  it("leaves the notification-status columns blank at the moment of the initial append", async () => {
    const repo = new InMemoryBookingRepository();
    const notifications = createFakeNotificationSender();
    // Capture the record as it looked immediately after appendBooking, before
    // the later updateNotificationStatus call mutates it in this test double.
    let snapshotAtAppend: { customerConfirmationStatus: string; internalNotificationStatus: string; notificationAttemptAt: string } | null = null;
    const originalAppend = repo.appendBooking.bind(repo);
    repo.appendBooking = async (record) => {
      snapshotAtAppend = {
        customerConfirmationStatus: record.customerConfirmationStatus,
        internalNotificationStatus: record.internalNotificationStatus,
        notificationAttemptAt: record.notificationAttemptAt,
      };
      await originalAppend(record);
    };
    await submitBooking(validInput({ idempotencyToken: "status-blank-at-append-token" }), repo, notifications);
    expect(snapshotAtAppend).toEqual({
      customerConfirmationStatus: "",
      internalNotificationStatus: "",
      notificationAttemptAt: "",
    });
  });
});

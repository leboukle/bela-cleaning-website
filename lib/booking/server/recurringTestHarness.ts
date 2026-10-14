// Test-only helper (not a .test.ts file): in-memory doubles for the
// Bookings sheet and the Recurring Schedules sheet, with the two properties
// the reliability tests need — every operation yields to the event loop
// (so two concurrent flows genuinely interleave step by step, like two
// serverless instances sharing one sheet) and crash points can be injected.
import { vi } from "vitest";
import type { BookingRepository, IdempotentBookingResult, ScheduleBookingRow } from "./repository";
import type { RecurringScheduleRepository } from "./recurringScheduleRepository";
import type { RecurringDeps } from "./recurringScheduleService";
import { createScheduleFromInitialBooking } from "./recurringScheduleService";
import type { RecurringScheduleRecord, ScheduleEvent } from "./recurringScheduleSchema";
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
import type { NotificationStatusUpdate } from "./notificationStatus";
import { sampleBookingRecord } from "./testFixtures";
import { hashManageToken } from "./manageToken";
import { FIRST_VISIT_PRICING_POLICY } from "@/lib/booking/recurringPricing";

/** Yields once so concurrent flows interleave at every storage operation. */
const tick = () => Promise.resolve();

export class InMemoryBookings implements BookingRepository {
  rows: BookingRecord[] = [];
  /** Throws from the Nth appendBooking onward when set (crash injection). */
  appendFailure: Error | null = null;
  /** Called after a row has been appended and before appendBooking resolves. */
  afterAppend: ((record: BookingRecord) => void) | null = null;
  /** Awaited immediately before a row is appended (pauses a writer mid-flight). */
  beforeAppend: (() => Promise<void>) | null = null;

  async appendBooking(record: BookingRecord): Promise<void> {
    await tick();
    if (this.beforeAppend) await this.beforeAppend();
    if (this.appendFailure) throw this.appendFailure;
    this.rows.push({ ...record });
    this.afterAppend?.(record);
  }
  async bookingIdExists(bookingId: string): Promise<boolean> {
    await tick();
    return this.rows.some((r) => r.bookingId === bookingId);
  }
  async findRecentBookingByIdempotencyToken(_token: string): Promise<IdempotentBookingResult | null> {
    return null;
  }
  async updateNotificationStatus(bookingId: string, update: NotificationStatusUpdate): Promise<void> {
    await tick();
    const row = this.rows.find((r) => r.bookingId === bookingId);
    if (!row) throw new Error("Booking ID not found.");
    row.customerConfirmationStatus = update.customerConfirmationStatus;
    row.internalNotificationStatus = update.internalNotificationStatus;
    row.notificationAttemptAt = update.notificationAttemptAt;
  }
  async getBookingPaymentState(bookingId: string): Promise<BookingPaymentState | null> {
    await tick();
    const r = this.rows.find((x) => x.bookingId === bookingId);
    if (!r) return null;
    return {
      bookingId: r.bookingId,
      bookingStatus: r.bookingStatus,
      paymentStatus: r.paymentStatus,
      serviceDate: r.serviceDate,
      stripeCustomerId: r.stripeCustomerId,
      stripePaymentMethodId: r.stripePaymentMethodId,
      stripePaymentIntentId: r.stripePaymentIntentId,
      scheduledChargeAt: r.scheduledChargeAt,
      originalBookingTotal: r.originalBookingTotal,
      chargeAmount: r.chargeAmount,
      paymentAttemptCount: r.paymentAttemptCount,
      nextPaymentAttemptAt: r.nextPaymentAttemptAt,
      manualAmountOverride: r.manualAmountOverride,
      recurringScheduleId: r.recurringScheduleId,
      occurrenceNumber: r.occurrenceNumber,
    };
  }
  async updatePaymentAttempt(bookingId: string, update: PaymentAttemptUpdate): Promise<void> {
    await tick();
    const r = this.rows.find((x) => x.bookingId === bookingId);
    if (!r) throw new Error("Booking ID not found.");
    r.paymentStatus = update.paymentStatus;
    r.stripePaymentIntentId = update.stripePaymentIntentId;
    r.paidAt = update.paidAt;
    r.paymentAttemptCount = update.paymentAttemptCount;
    r.lastPaymentAttemptAt = update.lastPaymentAttemptAt;
    r.nextPaymentAttemptAt = update.nextPaymentAttemptAt;
    r.paymentFailureCode = update.paymentFailureCode;
  }
  async getFullBookingRecord(bookingId: string): Promise<BookingRecord | null> {
    await tick();
    const r = this.rows.find((x) => x.bookingId === bookingId);
    return r ? { ...r } : null;
  }
  async findBookingIdByManageTokenHash(tokenHash: string): Promise<string | null> {
    await tick();
    const r = this.rows.find((x) => x.manageBookingTokenHash === tokenHash || x.manageBookingReminderTokenHash === tokenHash);
    return r?.bookingId ?? null;
  }
  async markBookingCancelled(bookingId: string, update: BookingCancellationInitiateUpdate): Promise<void> {
    await tick();
    const r = this.rows.find((x) => x.bookingId === bookingId);
    if (!r) throw new Error("Booking ID not found.");
    r.bookingStatus = "Cancelled";
    r.paymentStatus = update.paymentStatus;
    r.cancelledAt = update.cancelledAt;
    r.cancellationFeeAmount = update.cancellationFeeAmount;
  }
  async updateCancellationFeeOutcome(bookingId: string, update: CancellationFeeOutcomeUpdate): Promise<void> {
    await tick();
    const r = this.rows.find((x) => x.bookingId === bookingId);
    if (!r) throw new Error("Booking ID not found.");
    r.paymentStatus = update.paymentStatus;
    r.stripePaymentIntentId = update.stripePaymentIntentId;
    r.paidAt = update.paidAt;
  }
  async updateBookingReschedule(bookingId: string, update: BookingRescheduleUpdate): Promise<void> {
    await tick();
    const r = this.rows.find((x) => x.bookingId === bookingId);
    if (!r) throw new Error("Booking ID not found.");
    Object.assign(r, update);
  }
  async getBookingReminderState(): Promise<BookingReminderState | null> {
    return null;
  }
  async updateAppointmentReminderStatus(_id: string, _u: AppointmentReminderUpdate): Promise<void> {}
  async listAssignableBookings(): Promise<AssignableBookingSummary[]> {
    return this.rows
      .filter((r) => r.bookingStatus !== "Cancelled")
      .map((r) => ({
        bookingId: r.bookingId,
        bookingStatus: r.bookingStatus,
        firstName: r.firstName,
        streetAddress: r.streetAddress,
        apartmentOrUnit: r.apartmentOrUnit,
        city: r.city,
        state: r.state,
        zipCode: r.zipCode,
        serviceDate: r.serviceDate,
        arrivalWindow: r.arrivalWindow,
        serviceStartTime: r.serviceStartTime,
        cleaningType: r.cleaningType,
        chargeAmount: r.chargeAmount,
      }));
  }
  async markBookingCompleted(bookingId: string, completedAt: string): Promise<void> {
    await tick();
    const r = this.rows.find((x) => x.bookingId === bookingId);
    if (!r) throw new Error("Booking ID not found.");
    r.completedAt = completedAt;
  }
  async listScheduleBookings(scheduleId: string): Promise<ScheduleBookingRow[]> {
    await tick();
    return this.rows
      .filter((r) => r.recurringScheduleId === scheduleId)
      .map((r) => ({
        bookingId: r.bookingId,
        occurrenceNumber: r.occurrenceNumber,
        bookingStatus: r.bookingStatus,
        paymentStatus: r.paymentStatus,
        serviceDate: r.serviceDate,
        serviceStartTime: r.serviceStartTime,
        completedAt: r.completedAt,
        scheduledChargeAt: r.scheduledChargeAt,
        estimatedDurationMinutes: r.estimatedDurationMinutes,
        chargeAmount: r.chargeAmount,
        frequencyDiscount: r.frequencyDiscount,
        customerConfirmationStatus: r.customerConfirmationStatus,
        internalNotificationStatus: r.internalNotificationStatus,
        submittedAt: r.submittedAt,
      }));
  }
  async linkBookingToRecurringSchedule(bookingId: string, scheduleId: string, occurrenceNumber: number): Promise<void> {
    await tick();
    const r = this.rows.find((x) => x.bookingId === bookingId);
    if (!r) throw new Error("Booking ID not found.");
    r.recurringScheduleId = scheduleId;
    r.occurrenceNumber = occurrenceNumber;
  }
  async updateManageTokenHash(bookingId: string, tokenHash: string): Promise<void> {
    await tick();
    const r = this.rows.find((x) => x.bookingId === bookingId);
    if (!r) throw new Error("Booking ID not found.");
    r.manageBookingTokenHash = tokenHash;
  }

  // ---- test conveniences ----
  byId(bookingId: string): BookingRecord {
    const r = this.rows.find((x) => x.bookingId === bookingId);
    if (!r) throw new Error(`No row ${bookingId}`);
    return r;
  }
  forSchedule(scheduleId: string): BookingRecord[] {
    return this.rows.filter((r) => r.recurringScheduleId === scheduleId);
  }
  open(scheduleId: string): BookingRecord[] {
    return this.forSchedule(scheduleId).filter((r) => r.bookingStatus !== "Cancelled" && !r.completedAt);
  }
  complete(bookingId: string, at = "10/20/2026, 1:00:00 PM EDT"): void {
    this.byId(bookingId).completedAt = at;
  }
}

export class InMemorySchedules implements RecurringScheduleRepository {
  schedules: RecurringScheduleRecord[] = [];
  events: Array<ScheduleEvent> = [];
  private nextEventId = 1;
  /** Number of upcoming updateSchedule calls that should throw (crash injection). */
  failNextUpdates = 0;
  /** When set, the next createSchedule throws (schedule write lost after the booking was saved). */
  failNextCreate = false;

  async getSchedule(scheduleId: string): Promise<RecurringScheduleRecord | null> {
    await tick();
    const s = this.schedules.find((x) => x.scheduleId === scheduleId);
    return s ? { ...s } : null;
  }
  async createSchedule(record: RecurringScheduleRecord): Promise<{ created: boolean }> {
    await tick();
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error("simulated schedule write failure");
    }
    if (this.schedules.some((s) => s.scheduleId === record.scheduleId)) return { created: false };
    this.schedules.push({ ...record });
    return { created: true };
  }
  async updateSchedule(scheduleId: string, patch: Partial<Omit<RecurringScheduleRecord, "scheduleId">>): Promise<void> {
    await tick();
    if (this.failNextUpdates > 0) {
      this.failNextUpdates -= 1;
      throw new Error("simulated crash before schedule update");
    }
    const s = this.schedules.find((x) => x.scheduleId === scheduleId);
    if (!s) throw new Error("Recurring schedule not found when updating.");
    Object.assign(s, patch);
  }
  async listScheduleIds(statuses: readonly string[]): Promise<string[]> {
    await tick();
    return this.schedules.filter((s) => statuses.includes(s.status)).map((s) => s.scheduleId);
  }
  async appendEvent(event: Omit<ScheduleEvent, "eventId" | "claimKey"> & { claimKey?: string }): Promise<void> {
    await tick();
    this.events.push({ ...event, eventId: `E${this.nextEventId++}`, claimKey: event.claimKey ?? "" });
  }
  async claimOnce(claimKey: string, scheduleId: string, detail: string, now: Date): Promise<boolean> {
    await tick();
    const eventId = `E${this.nextEventId++}`;
    this.events.push({
      eventId,
      timestamp: now.toISOString(),
      scheduleId,
      occurrenceNumber: "",
      eventType: "claim",
      claimKey,
      detail,
    });
    await tick();
    return this.events.find((e) => e.claimKey === claimKey)?.eventId === eventId;
  }
  async hasClaim(claimKey: string): Promise<boolean> {
    await tick();
    return this.events.some((e) => e.claimKey === claimKey);
  }
  async countClaims(keyPrefix: string): Promise<number> {
    await tick();
    return this.events.filter((e) => e.claimKey.startsWith(keyPrefix)).length;
  }
  async listSchedules(): Promise<RecurringScheduleRecord[]> {
    await tick();
    return this.schedules.map((s) => ({ ...s }));
  }

  get(scheduleId: string): RecurringScheduleRecord {
    const s = this.schedules.find((x) => x.scheduleId === scheduleId);
    if (!s) throw new Error(`No schedule ${scheduleId}`);
    return s;
  }
  eventsOfType(type: string): ScheduleEvent[] {
    return this.events.filter((e) => e.eventType === type);
  }
}

export function makeNotifications() {
  return {
    sendRecurringAppointmentScheduled: vi.fn(async () => ({ ok: true as const })),
    sendInternalRecurringAppointmentCreated: vi.fn(async () => ({ ok: true as const })),
    sendInternalRecurringScheduleAlert: vi.fn(async () => ({ ok: true as const })),
    sendFreeCancellationConfirmation: vi.fn(async () => ({ ok: true as const })),
    sendLateCancellationConfirmation: vi.fn(async () => ({ ok: true as const })),
    sendInternalCancellationNotification: vi.fn(async () => ({ ok: true as const })),
    sendInternalCancellationFeeFailed: vi.fn(async () => ({ ok: true as const })),
  };
}

export type Harness = {
  bookings: InMemoryBookings;
  schedules: InMemorySchedules;
  notifications: ReturnType<typeof makeNotifications>;
  deps: RecurringDeps;
};

export function makeHarness(): Harness {
  const bookings = new InMemoryBookings();
  const schedules = new InMemorySchedules();
  const notifications = makeNotifications();
  return { bookings, schedules, notifications, deps: { bookings, schedules, notifications } };
}

export const INITIAL_RAW_TOKEN = "I".repeat(43);

/**
 * Seeds a NEW-model recurring initial appointment (occurrence 1, full price)
 * plus its schedule row, exactly as bookingService.ts would have.
 * 2 BR ($130) + 2 BA ($20) + 1,001–2,000 sq ft ($15) = $165 regular price.
 */
export async function seedInitialAppointment(
  h: Harness,
  overrides: Partial<BookingRecord> = {},
  options: { createSchedule?: boolean } = {},
): Promise<BookingRecord> {
  const bookingId = overrides.bookingId ?? "BELA-20261102-AAAAAA";
  const record = sampleBookingRecord({
    bookingId,
    submittedAt: "2026-10-13T15:00:00.000Z",
    bookingStatus: "Pending Payment",
    paymentStatus: "Scheduled",
    serviceDate: "2026-11-02",
    arrivalWindow: "",
    serviceStartTime: "09:00",
    extras: "none",
    frequency: "Weekly",
    baseCleaningPrice: 130,
    bathroomPrice: 20,
    squareFootagePrice: 15,
    cleaningTypePrice: 0,
    extrasPrice: 0,
    subtotal: 165,
    frequencyDiscount: 0,
    totalPrice: 165,
    originalBookingTotal: 165,
    chargeAmount: 165,
    estimatedDurationMinutes: 240,
    // 09:00 EST (UTC-5) + 240 min + 60 min = 14:00 EST = 19:00Z on 2026-11-02
    scheduledChargeAt: "2026-11-02T19:00:00.000Z",
    stripeCustomerId: "cus_test",
    stripePaymentMethodId: "pm_test",
    stripeSetupIntentId: "seti_test",
    pricingPolicy: FIRST_VISIT_PRICING_POLICY,
    recurringScheduleId: bookingId,
    occurrenceNumber: 1,
    manageBookingTokenHash: hashManageToken(INITIAL_RAW_TOKEN),
    ...overrides,
  });
  h.bookings.rows.push({ ...record });
  if (options.createSchedule !== false) {
    await createScheduleFromInitialBooking(record, true, h.schedules, "America/New_York");
  }
  return record;
}

// SERVER-ONLY. Storage abstraction for recurring schedules, mirroring the
// BookingRepository pattern: the schedule service depends on this
// interface, never on Google Sheets directly, so every rule is unit-testable
// against an in-memory implementation.
import "server-only";
import type { RecurringScheduleRecord, ScheduleEvent } from "./recurringScheduleSchema";

export interface RecurringScheduleRepository {
  /** The schedule row for this ID, or null. If duplicate rows exist the FIRST (sheet order) wins. */
  getSchedule(scheduleId: string): Promise<RecurringScheduleRecord | null>;

  /** Every schedule (one per ID, first row wins), in sheet order — for the owner dashboard. */
  listSchedules(): Promise<RecurringScheduleRecord[]>;

  /**
   * Appends the schedule row unless one with this ID already exists.
   * Idempotent: returns `created: false` for an existing schedule and never
   * overwrites it.
   */
  createSchedule(record: RecurringScheduleRecord): Promise<{ created: boolean }>;

  /**
   * Writes ONLY the given fields of an existing schedule (cell-targeted,
   * never a whole-row rewrite), so two writers touching different fields
   * cannot clobber each other.
   */
  updateSchedule(scheduleId: string, patch: Partial<Omit<RecurringScheduleRecord, "scheduleId">>): Promise<void>;

  /** IDs of schedules whose Status is one of `statuses`, in sheet order. */
  listScheduleIds(statuses: readonly string[]): Promise<string[]>;

  /** Appends one audit event. */
  appendEvent(event: Omit<ScheduleEvent, "eventId" | "claimKey"> & { claimKey?: string }): Promise<void>;

  /**
   * Once-only arbitration. Appends a claim row for `claimKey` and then reads
   * back every claim for that key: true only if THIS call's row is the
   * earliest. Row order on an append-only sheet is the arbiter, so exactly
   * one of any number of concurrent callers (across serverless instances)
   * wins. Used for side effects that must happen at most once: customer
   * confirmation emails, owner alerts.
   */
  claimOnce(claimKey: string, scheduleId: string, detail: string, now: Date): Promise<boolean>;

  /** True if any event (claim or otherwise) carries this claim key. */
  hasClaim(claimKey: string): Promise<boolean>;

  /** Number of claim rows whose key starts with `keyPrefix` (used to number retry attempts). */
  countClaims(keyPrefix: string): Promise<number>;
}

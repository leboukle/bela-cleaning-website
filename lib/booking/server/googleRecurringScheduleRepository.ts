// SERVER-ONLY. Google Sheets implementation of RecurringScheduleRepository.
import "server-only";
import { randomUUID } from "node:crypto";
import { appendRow, batchUpdateRanges, getRange } from "./sheetsClient";
import type { RecurringScheduleRepository } from "./recurringScheduleRepository";
import {
  SCHEDULES_FULL_RANGE,
  SCHEDULES_LAST_COLUMN_LETTER,
  SCHEDULES_SHEET_NAME,
  SCHEDULE_EVENTS_FULL_RANGE,
  SCHEDULE_EVENTS_SHEET_NAME,
  SCHEDULE_FIELDS,
  scheduleKeyColumnLetter,
  EVENT_TYPE,
  type RecurringScheduleRecord,
  type ScheduleEvent,
} from "./recurringScheduleSchema";
import { formatOperationalTimestamp } from "./dateUtils";

const TABLE_RANGE = `${SCHEDULES_SHEET_NAME}!A2:${SCHEDULES_LAST_COLUMN_LETTER}`;
const ID_COLUMN_RANGE = `${SCHEDULES_SHEET_NAME}!A2:A`;
const EVENT_KEY_COLUMN_RANGE = `${SCHEDULE_EVENTS_SHEET_NAME}!F2:F`; // "Claim Key"
const EVENT_ID_COLUMN_RANGE = `${SCHEDULE_EVENTS_SHEET_NAME}!A2:A`;

export function scheduleToRow(record: RecurringScheduleRecord): Array<string | number> {
  return SCHEDULE_FIELDS.map((field) => record[field.key] as string | number);
}

export function rowToSchedule(row: string[]): RecurringScheduleRecord {
  const out: Record<string, string | number> = {};
  SCHEDULE_FIELDS.forEach((field, index) => {
    const raw = row[index] ?? "";
    out[field.key] = field.type === "number" ? Number(raw || 0) : String(raw);
  });
  return out as unknown as RecurringScheduleRecord;
}

export class GoogleRecurringScheduleRepository implements RecurringScheduleRepository {
  async getSchedule(scheduleId: string): Promise<RecurringScheduleRecord | null> {
    const rows = await getRange(TABLE_RANGE);
    const row = rows.find((r) => r[0] === scheduleId);
    return row ? rowToSchedule(row) : null;
  }

  async createSchedule(record: RecurringScheduleRecord): Promise<{ created: boolean }> {
    const ids = await getRange(ID_COLUMN_RANGE);
    if (ids.some((r) => r[0] === record.scheduleId)) return { created: false };
    await appendRow(SCHEDULES_FULL_RANGE, scheduleToRow(record));
    return { created: true };
  }

  async updateSchedule(scheduleId: string, patch: Partial<Omit<RecurringScheduleRecord, "scheduleId">>): Promise<void> {
    const ids = await getRange(ID_COLUMN_RANGE);
    const index = ids.findIndex((r) => r[0] === scheduleId);
    if (index === -1) throw new Error("Recurring schedule not found when updating.");
    const sheetRow = index + 2; // +1 header, +1 for 1-based rows
    const updates = (Object.keys(patch) as Array<keyof typeof patch>)
      .filter((key) => patch[key] !== undefined)
      .map((key) => {
        const letter = scheduleKeyColumnLetter(key);
        return { range: `${SCHEDULES_SHEET_NAME}!${letter}${sheetRow}`, row: [patch[key] as string | number] };
      });
    if (updates.length === 0) return;
    await batchUpdateRanges(updates);
  }

  async listScheduleIds(statuses: readonly string[]): Promise<string[]> {
    const rows = await getRange(`${SCHEDULES_SHEET_NAME}!A2:B`);
    return rows.filter((r) => r[0] && statuses.includes(r[1] ?? "")).map((r) => r[0]);
  }

  async appendEvent(event: Omit<ScheduleEvent, "eventId" | "claimKey"> & { claimKey?: string }): Promise<void> {
    await appendRow(SCHEDULE_EVENTS_FULL_RANGE, [
      randomUUID(),
      event.timestamp,
      event.scheduleId,
      event.occurrenceNumber,
      event.eventType,
      event.claimKey ?? "",
      event.detail,
    ]);
  }

  async claimOnce(claimKey: string, scheduleId: string, detail: string, now: Date): Promise<boolean> {
    const eventId = randomUUID();
    await appendRow(SCHEDULE_EVENTS_FULL_RANGE, [
      eventId,
      formatOperationalTimestamp(now),
      scheduleId,
      "",
      EVENT_TYPE.CLAIM,
      claimKey,
      detail,
    ]);
    const [keys, ids] = await Promise.all([getRange(EVENT_KEY_COLUMN_RANGE), getRange(EVENT_ID_COLUMN_RANGE)]);
    const firstIndex = keys.findIndex((r) => r[0] === claimKey);
    if (firstIndex === -1) return false;
    return ids[firstIndex]?.[0] === eventId;
  }

  async hasClaim(claimKey: string): Promise<boolean> {
    const keys = await getRange(EVENT_KEY_COLUMN_RANGE);
    return keys.some((r) => r[0] === claimKey);
  }
}

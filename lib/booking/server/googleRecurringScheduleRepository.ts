// SERVER-ONLY. Google Sheets implementation of RecurringScheduleRepository.
//
// WHERE THE "WINNER" COMES FROM (the concurrency model, concretely):
// every contested decision is settled by an APPEND followed by a READ of
// the same worksheet in sheet order.
//   * appendRow uses insertDataOption=INSERT_ROWS, so each request's row is
//     inserted as a NEW row after the table's last row — concurrent
//     requests never overwrite one another — and the API response says
//     which sheet row this request's row received (updates.updatedRange).
//   * Reads (values.get) reflect committed rows in row order.
//   * Therefore "the first row carrying key K" is the same row for every
//     reader that appended after it, on any serverless instance. A caller
//     wins iff the first row for K is the row its own append returned.
// Nothing here relies on in-process memory, timing, or the row's content
// alone. The one assumption — that Sheets orders committed appends and a
// subsequent read sees them — is exactly what the owner's live self-test
// (runClaimSelfTest, wired to a button) exercises against the real sheet.
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
const ID_STATUS_RANGE = `${SCHEDULES_SHEET_NAME}!A2:B`;
// Event ID (A) .. Claim Key (F): ONE read, so ids and keys always align.
const EVENT_CLAIM_RANGE = `${SCHEDULE_EVENTS_SHEET_NAME}!A2:F`;
const CLAIM_KEY_INDEX = 5;

/** A row marked as a lost duplicate of another row with the same Schedule ID. */
export const DUPLICATE_STATUS = "Duplicate";

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

/** The sheet row (1-based) the FIRST non-duplicate schedule row for `scheduleId` occupies, or -1. */
function firstScheduleRow(idStatus: string[][], scheduleId: string): number {
  const index = idStatus.findIndex((r) => r[0] === scheduleId && r[1] !== DUPLICATE_STATUS);
  return index === -1 ? -1 : index + 2;
}

export class GoogleRecurringScheduleRepository implements RecurringScheduleRepository {
  async getSchedule(scheduleId: string): Promise<RecurringScheduleRecord | null> {
    const rows = await getRange(TABLE_RANGE);
    const row = rows.find((r) => r[0] === scheduleId && r[1] !== DUPLICATE_STATUS);
    return row ? rowToSchedule(row) : null;
  }

  async listSchedules(): Promise<RecurringScheduleRecord[]> {
    const rows = await getRange(TABLE_RANGE);
    const seen = new Set<string>();
    const result: RecurringScheduleRecord[] = [];
    for (const row of rows) {
      const id = row[0];
      if (!id || row[1] === DUPLICATE_STATUS || seen.has(id)) continue;
      seen.add(id);
      result.push(rowToSchedule(row));
    }
    return result;
  }

  /**
   * Concurrent creation (the booking request and a reconciliation repair, or
   * two repairs) is arbitrated like every other contested write: append, then
   * look at which row is FIRST for this Schedule ID. A loser marks its own
   * row "Duplicate" (a cell write to its own row — rows are never deleted),
   * so every other read ignores it and the winner's row is the only schedule.
   */
  async createSchedule(record: RecurringScheduleRecord): Promise<{ created: boolean }> {
    const before = await getRange(ID_STATUS_RANGE);
    if (firstScheduleRow(before, record.scheduleId) !== -1) return { created: false };

    const { rowNumber } = await appendRow(SCHEDULES_FULL_RANGE, scheduleToRow(record));

    const after = await getRange(ID_STATUS_RANGE);
    const winnerRow = firstScheduleRow(after, record.scheduleId);
    if (rowNumber !== null && winnerRow === rowNumber) return { created: true };

    if (rowNumber !== null) {
      // Lost: neutralize my own row so nothing ever reads it as a schedule.
      await batchUpdateRanges([
        {
          range: `${SCHEDULES_SHEET_NAME}!${scheduleKeyColumnLetter("status")}${rowNumber}`,
          row: [DUPLICATE_STATUS],
        },
      ]);
    }
    return { created: false };
  }

  async updateSchedule(scheduleId: string, patch: Partial<Omit<RecurringScheduleRecord, "scheduleId">>): Promise<void> {
    const idStatus = await getRange(ID_STATUS_RANGE);
    const sheetRow = firstScheduleRow(idStatus, scheduleId);
    if (sheetRow === -1) throw new Error("Recurring schedule not found when updating.");
    const updates = (Object.keys(patch) as Array<keyof typeof patch>)
      .filter((key) => patch[key] !== undefined)
      .map((key) => ({
        range: `${SCHEDULES_SHEET_NAME}!${scheduleKeyColumnLetter(key)}${sheetRow}`,
        row: [patch[key] as string | number],
      }));
    if (updates.length === 0) return;
    await batchUpdateRanges(updates);
  }

  async listScheduleIds(statuses: readonly string[]): Promise<string[]> {
    const rows = await getRange(ID_STATUS_RANGE);
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const r of rows) {
      if (!r[0] || r[1] === DUPLICATE_STATUS || seen.has(r[0])) continue;
      seen.add(r[0]);
      if (statuses.includes(r[1] ?? "")) ids.push(r[0]);
    }
    return ids;
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
    const { rowNumber } = await appendRow(SCHEDULE_EVENTS_FULL_RANGE, [
      eventId,
      formatOperationalTimestamp(now),
      scheduleId,
      "",
      EVENT_TYPE.CLAIM,
      claimKey,
      detail,
    ]);
    // Read AFTER my append, in ONE request: any claim row that was committed
    // before mine is in this snapshot, in row order.
    const rows = await getRange(EVENT_CLAIM_RANGE);
    const firstIndex = rows.findIndex((r) => r[CLAIM_KEY_INDEX] === claimKey);
    if (firstIndex === -1) return false; // my own row should be here; fail closed
    if (rowNumber !== null) return firstIndex + 2 === rowNumber;
    return rows[firstIndex]?.[0] === eventId;
  }

  async hasClaim(claimKey: string): Promise<boolean> {
    const rows = await getRange(EVENT_CLAIM_RANGE);
    return rows.some((r) => r[CLAIM_KEY_INDEX] === claimKey);
  }

  async countClaims(keyPrefix: string): Promise<number> {
    const rows = await getRange(EVENT_CLAIM_RANGE);
    return rows.filter((r) => (r[CLAIM_KEY_INDEX] ?? "").startsWith(keyPrefix)).length;
  }
}

/**
 * Live concurrency self-test for the owner's setup page: fires `contenders`
 * simultaneous claims on ONE brand-new key against the real sheet and
 * reports how many believed they won. Correct arbitration => exactly 1.
 * Writes only `selftest:`-prefixed claim rows to the events worksheet.
 */
export async function runClaimSelfTest(
  repository: RecurringScheduleRepository,
  contenders = 8,
  now: Date = new Date(),
): Promise<{ contenders: number; winners: number; passed: boolean; key: string }> {
  const key = `selftest:${now.getTime()}:${randomUUID().slice(0, 8)}`;
  const results = await Promise.all(
    Array.from({ length: contenders }, () => repository.claimOnce(key, "SELFTEST", "claim concurrency self-test", now)),
  );
  const winners = results.filter(Boolean).length;
  return { contenders, winners, passed: winners === 1, key };
}


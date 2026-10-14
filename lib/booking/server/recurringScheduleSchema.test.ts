import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SCHEDULE_COLUMNS,
  SCHEDULE_EVENT_COLUMNS,
  SCHEDULE_FIELDS,
  SCHEDULES_LAST_COLUMN_LETTER,
  scheduleColumnLetter,
  type RecurringScheduleRecord,
} from "./recurringScheduleSchema";
import { rowToSchedule, scheduleToRow } from "./googleRecurringScheduleRepository";
import { BOOKINGS_COLUMNS } from "./bookingsSheetSchema";

const SCRIPT = readFileSync(join(process.cwd(), "apps-script", "recurringScheduler.gs"), "utf8");

describe("Recurring Schedules worksheet contract", () => {
  it("has unique columns, starting with Schedule ID and Status", () => {
    expect(new Set(SCHEDULE_COLUMNS).size).toBe(SCHEDULE_COLUMNS.length);
    expect(SCHEDULE_COLUMNS[0]).toBe("Schedule ID");
    expect(SCHEDULE_COLUMNS[1]).toBe("Status");
    expect(scheduleColumnLetter("Schedule ID")).toBe("A");
    expect(scheduleColumnLetter("Status")).toBe("B");
  });

  it("is 48 columns ending at AV (the sheet needs exactly these headers, in this order)", () => {
    expect(SCHEDULE_FIELDS).toHaveLength(48);
    expect(SCHEDULES_LAST_COLUMN_LETTER).toBe("AV");
    expect(SCHEDULE_COLUMNS[SCHEDULE_COLUMNS.length - 1]).toBe("Ended Reason");
  });

  it("round-trips a record through a sheet row, preserving numbers and strings", () => {
    const record = Object.fromEntries(
      SCHEDULE_FIELDS.map((f, i) => [f.key, f.type === "number" ? i + 0.5 : `v${i}`]),
    ) as unknown as RecurringScheduleRecord;
    const row = scheduleToRow(record).map((v) => String(v));
    expect(rowToSchedule(row)).toEqual(record);
  });

  it("the events worksheet has the audit and claim columns", () => {
    expect(SCHEDULE_EVENT_COLUMNS).toEqual([
      "Event ID",
      "Timestamp",
      "Schedule ID",
      "Occurrence Number",
      "Event Type",
      "Claim Key",
      "Detail",
    ]);
  });
});

describe("apps-script/recurringScheduler.gs stays in step with the sheet contracts", () => {
  it("looks up the Bookings columns it reads by the exact header names", () => {
    for (const header of ["Booking ID", "Booking Status", "Recurring Schedule ID", "Occurrence Number", "Completed At"]) {
      expect(BOOKINGS_COLUMNS).toContain(header);
      expect(SCRIPT).toContain(`"${header}"`);
    }
  });

  it("looks up the schedule columns it reads by the exact header names", () => {
    for (const header of ["Schedule ID", "Status"]) {
      expect(SCHEDULE_COLUMNS).toContain(header);
      expect(SCRIPT).toContain(`"${header}"`);
    }
    expect(SCRIPT).toContain('"Recurring Schedules"');
  });

  it("only ever reads — it never writes to the sheets", () => {
    expect(SCRIPT).not.toMatch(/\.(appendRow|insertRow|setValue|setValues|deleteRow|clear)\(/);
  });

  it("uses the shared secret header, the reconcile endpoint property, a lock, and a request bound matching the route", () => {
    expect(SCRIPT).toContain("x-payment-scheduler-secret");
    expect(SCRIPT).toContain("RECURRING_RECONCILE_ENDPOINT_URL");
    expect(SCRIPT).toContain("LockService.getScriptLock()");
    expect(SCRIPT).toContain("RECUR_MAX_IDS_PER_REQUEST = 100");
  });

  it("namespaces its globals so it cannot collide with the other scheduler files", () => {
    const names = [...SCRIPT.matchAll(/^var ([A-Za-z0-9_]+)\s*=/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) expect(name.startsWith("RECUR_")).toBe(true);
  });
});

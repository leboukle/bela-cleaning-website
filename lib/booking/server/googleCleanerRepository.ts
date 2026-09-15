// SERVER-ONLY. The Google Sheets implementation of CleanerAssignmentRepository.
// Built on the exact same low-level primitives (getRange, batchGetRanges,
// appendRow, batchUpdateRanges) GoogleSheetsBookingRepository already
// uses — no new Sheets client code, no new Google Cloud auth; a second/
// third tab in the same spreadsheet is just a different sheet-name prefix
// on the same authenticated client (see sheetsClient.ts).
import "server-only";
import { appendRow, batchUpdateRanges, getRange } from "./sheetsClient";
import {
  CLEANER_ASSIGNMENTS_COLUMNS,
  CLEANER_ASSIGNMENTS_LAST_COLUMN_LETTER,
  CLEANER_ASSIGNMENTS_SHEET_NAME,
  CLEANERS_COLUMNS,
  CLEANERS_LAST_COLUMN_LETTER,
  CLEANERS_SHEET_NAME,
  CLEANER_STATUS,
  assignmentsColumnLetter,
} from "./cleanerSheetSchema";
import type { CleanerAssignmentRepository } from "./cleanerRepository";
import type { AssignmentResolutionUpdate, AssignmentRecord, CleanerReminderUpdate, CleanerRecord, CreateAssignmentUpdate } from "./cleanerTypes";
import { manageTokenHashesMatch } from "./manageToken";

function assignmentsColumnRange(column: (typeof CLEANER_ASSIGNMENTS_COLUMNS)[number]): string {
  const letter = assignmentsColumnLetter(column);
  return `${CLEANER_ASSIGNMENTS_SHEET_NAME}!${letter}2:${letter}`;
}

function rowToCleaner(row: string[]): CleanerRecord {
  const get = (col: (typeof CLEANERS_COLUMNS)[number]) => row[CLEANERS_COLUMNS.indexOf(col)] ?? "";
  return {
    cleanerId: get("Cleaner ID"),
    firstName: get("First Name"),
    lastName: get("Last Name"),
    email: get("Email"),
    phone: get("Phone"),
    status: get("Status"),
    createdAt: get("Created At"),
  };
}

function rowToAssignment(row: string[]): AssignmentRecord {
  const get = (col: (typeof CLEANER_ASSIGNMENTS_COLUMNS)[number]) => row[CLEANER_ASSIGNMENTS_COLUMNS.indexOf(col)] ?? "";
  return {
    assignmentId: get("Assignment ID"),
    bookingId: get("Booking ID"),
    cleanerId: get("Cleaner ID"),
    cleanerName: get("Cleaner Name"),
    status: get("Status"),
    offeredAt: get("Offered At"),
    responseDeadline: get("Response Deadline"),
    acceptedAt: get("Accepted At"),
    declinedAt: get("Declined At"),
    expiredAt: get("Expired At"),
    cleaningTotalSnapshot: Number(get("Cleaning Total Snapshot") || 0),
    payoutPercentageSnapshot: Number(get("Payout Percentage Snapshot") || 0),
    payoutAmountSnapshot: Number(get("Payout Amount Snapshot") || 0),
    assignmentTokenHash: get("Assignment Token Hash"),
    cleanerReminderStatus: get("Cleaner Reminder Status"),
    cleanerReminderSentAt: get("Cleaner Reminder Sent At"),
    cleanerReminderAttempts: Number(get("Cleaner Reminder Attempts") || 0),
    payoutStatementSentAt: get("Payout Statement Sent At"),
  };
}

export class GoogleSheetsCleanerRepository implements CleanerAssignmentRepository {
  async getActiveCleaners(): Promise<CleanerRecord[]> {
    const rows = await getRange(`${CLEANERS_SHEET_NAME}!A2:${CLEANERS_LAST_COLUMN_LETTER}`);
    return rows.map(rowToCleaner).filter((cleaner) => cleaner.cleanerId && cleaner.status === CLEANER_STATUS.ACTIVE);
  }

  async getCleanerById(cleanerId: string): Promise<CleanerRecord | null> {
    const rows = await getRange(`${CLEANERS_SHEET_NAME}!A2:${CLEANERS_LAST_COLUMN_LETTER}`);
    const row = rows.find((r) => r[0] === cleanerId);
    return row ? rowToCleaner(row) : null;
  }

  async getLatestAssignmentForBooking(bookingId: string): Promise<AssignmentRecord | null> {
    const idRows = await getRange(assignmentsColumnRange("Booking ID"));
    let lastMatchIndex = -1;
    for (let i = 0; i < idRows.length; i++) {
      if (idRows[i][0] === bookingId) lastMatchIndex = i;
    }
    if (lastMatchIndex === -1) return null;

    const sheetRow = lastMatchIndex + 2;
    const rows = await getRange(`${CLEANER_ASSIGNMENTS_SHEET_NAME}!A${sheetRow}:${CLEANER_ASSIGNMENTS_LAST_COLUMN_LETTER}${sheetRow}`);
    const row = rows[0];
    return row ? rowToAssignment(row) : null;
  }

  async createAssignment(update: CreateAssignmentUpdate): Promise<void> {
    const valueByColumn: Record<(typeof CLEANER_ASSIGNMENTS_COLUMNS)[number], string | number> = {
      "Assignment ID": update.assignmentId,
      "Booking ID": update.bookingId,
      "Cleaner ID": update.cleanerId,
      "Cleaner Name": update.cleanerName,
      Status: update.status,
      "Offered At": update.offeredAt,
      "Response Deadline": update.responseDeadline,
      "Accepted At": "",
      "Declined At": "",
      "Expired At": "",
      "Cleaning Total Snapshot": update.cleaningTotalSnapshot,
      "Payout Percentage Snapshot": update.payoutPercentageSnapshot,
      "Payout Amount Snapshot": update.payoutAmountSnapshot,
      "Assignment Token Hash": update.assignmentTokenHash,
      "Cleaner Reminder Status": "",
      "Cleaner Reminder Sent At": "",
      "Cleaner Reminder Attempts": 0,
      "Payout Statement Sent At": "",
    };
    const row = CLEANER_ASSIGNMENTS_COLUMNS.map((col) => valueByColumn[col]);
    await appendRow(`${CLEANER_ASSIGNMENTS_SHEET_NAME}!A:${CLEANER_ASSIGNMENTS_LAST_COLUMN_LETTER}`, row);
  }

  async findAssignmentByTokenHash(tokenHash: string): Promise<AssignmentRecord | null> {
    const hashRows = await getRange(assignmentsColumnRange("Assignment Token Hash"));
    const rowIndex = hashRows.findIndex((row) => manageTokenHashesMatch(row[0] ?? "", tokenHash));
    if (rowIndex === -1) return null;

    const sheetRow = rowIndex + 2;
    const rows = await getRange(`${CLEANER_ASSIGNMENTS_SHEET_NAME}!A${sheetRow}:${CLEANER_ASSIGNMENTS_LAST_COLUMN_LETTER}${sheetRow}`);
    const row = rows[0];
    return row ? rowToAssignment(row) : null;
  }

  async getAssignmentById(assignmentId: string): Promise<AssignmentRecord | null> {
    const idRows = await getRange(assignmentsColumnRange("Assignment ID"));
    const rowIndex = idRows.findIndex((row) => row[0] === assignmentId);
    if (rowIndex === -1) return null;

    const sheetRow = rowIndex + 2;
    const rows = await getRange(`${CLEANER_ASSIGNMENTS_SHEET_NAME}!A${sheetRow}:${CLEANER_ASSIGNMENTS_LAST_COLUMN_LETTER}${sheetRow}`);
    const row = rows[0];
    return row ? rowToAssignment(row) : null;
  }

  private async findRowIndexByAssignmentId(assignmentId: string): Promise<number> {
    const idRows = await getRange(assignmentsColumnRange("Assignment ID"));
    const rowIndex = idRows.findIndex((row) => row[0] === assignmentId);
    if (rowIndex === -1) throw new Error("Assignment ID not found.");
    return rowIndex;
  }

  async updateAssignmentResolution(assignmentId: string, update: AssignmentResolutionUpdate): Promise<void> {
    const sheetRow = (await this.findRowIndexByAssignmentId(assignmentId)) + 2;
    const statusCol = assignmentsColumnLetter("Status");
    const acceptedStartCol = assignmentsColumnLetter("Accepted At");
    const expiredEndCol = assignmentsColumnLetter("Expired At");

    await batchUpdateRanges([
      { range: `${CLEANER_ASSIGNMENTS_SHEET_NAME}!${statusCol}${sheetRow}`, row: [update.status] },
      {
        range: `${CLEANER_ASSIGNMENTS_SHEET_NAME}!${acceptedStartCol}${sheetRow}:${expiredEndCol}${sheetRow}`,
        row: [update.acceptedAt, update.declinedAt, update.expiredAt],
      },
    ]);
  }

  async updateCleanerReminderStatus(assignmentId: string, update: CleanerReminderUpdate): Promise<void> {
    const sheetRow = (await this.findRowIndexByAssignmentId(assignmentId)) + 2;
    const startCol = assignmentsColumnLetter("Cleaner Reminder Status");
    const endCol = assignmentsColumnLetter("Cleaner Reminder Attempts");

    await batchUpdateRanges([
      {
        range: `${CLEANER_ASSIGNMENTS_SHEET_NAME}!${startCol}${sheetRow}:${endCol}${sheetRow}`,
        row: [update.cleanerReminderStatus, update.cleanerReminderSentAt, update.cleanerReminderAttempts],
      },
    ]);
  }

  async markPayoutStatementSent(assignmentId: string, sentAt: string): Promise<void> {
    const sheetRow = (await this.findRowIndexByAssignmentId(assignmentId)) + 2;
    const col = assignmentsColumnLetter("Payout Statement Sent At");
    await batchUpdateRanges([{ range: `${CLEANER_ASSIGNMENTS_SHEET_NAME}!${col}${sheetRow}`, row: [sentAt] }]);
  }
}

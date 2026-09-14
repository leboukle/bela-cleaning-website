import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./sheetsClient", () => ({
  appendRow: vi.fn(),
  getRange: vi.fn(),
  batchUpdateRanges: vi.fn(),
}));

import { appendRow, getRange, batchUpdateRanges } from "./sheetsClient";
import { GoogleSheetsCleanerRepository } from "./googleCleanerRepository";
import { CLEANER_ASSIGNMENTS_COLUMNS, CLEANERS_COLUMNS } from "./cleanerSheetSchema";
import { hashManageToken } from "./manageToken";
import type { CreateAssignmentUpdate } from "./cleanerTypes";

const mockedAppendRow = vi.mocked(appendRow);
const mockedGetRange = vi.mocked(getRange);
const mockedBatchUpdateRanges = vi.mocked(batchUpdateRanges);

beforeEach(() => {
  mockedAppendRow.mockReset();
  mockedGetRange.mockReset();
  mockedBatchUpdateRanges.mockReset();
});

function cleanerRow(overrides: Partial<Record<(typeof CLEANERS_COLUMNS)[number], string>> = {}): string[] {
  const base: Record<(typeof CLEANERS_COLUMNS)[number], string> = {
    "Cleaner ID": "CLNR-AAAAAA",
    "First Name": "Susie",
    "Last Name": "Smith",
    Email: "susie@example.com",
    Phone: "5551234567",
    Status: "Active",
    "Created At": "01/01/2026, 12:00:00 PM EST",
    ...overrides,
  };
  return CLEANERS_COLUMNS.map((col) => base[col]);
}

function assignmentRow(overrides: Partial<Record<(typeof CLEANER_ASSIGNMENTS_COLUMNS)[number], string>> = {}): string[] {
  const base: Record<(typeof CLEANER_ASSIGNMENTS_COLUMNS)[number], string> = {
    "Assignment ID": "ASGN-1",
    "Booking ID": "BELA-1",
    "Cleaner ID": "CLNR-AAAAAA",
    "Cleaner Name": "Susie Smith",
    Status: "Pending",
    "Offered At": "",
    "Response Deadline": "",
    "Accepted At": "",
    "Declined At": "",
    "Expired At": "",
    "Cleaning Total Snapshot": "190.5",
    "Payout Percentage Snapshot": "0.6",
    "Payout Amount Snapshot": "114.3",
    "Assignment Token Hash": "",
    "Cleaner Reminder Status": "",
    "Cleaner Reminder Sent At": "",
    "Cleaner Reminder Attempts": "0",
    "Payout Statement Sent At": "",
    ...overrides,
  };
  return CLEANER_ASSIGNMENTS_COLUMNS.map((col) => base[col]);
}

describe("GoogleSheetsCleanerRepository.getActiveCleaners", () => {
  it("returns only Active cleaners", async () => {
    mockedGetRange.mockResolvedValue([cleanerRow({ "Cleaner ID": "CLNR-A", Status: "Active" }), cleanerRow({ "Cleaner ID": "CLNR-B", Status: "Inactive" })]);
    const repo = new GoogleSheetsCleanerRepository();
    const result = await repo.getActiveCleaners();
    expect(result.map((c) => c.cleanerId)).toEqual(["CLNR-A"]);
  });
});

describe("GoogleSheetsCleanerRepository.getCleanerById", () => {
  it("finds the matching row", async () => {
    mockedGetRange.mockResolvedValue([cleanerRow({ "Cleaner ID": "CLNR-A", "First Name": "Amy" })]);
    const repo = new GoogleSheetsCleanerRepository();
    const result = await repo.getCleanerById("CLNR-A");
    expect(result?.firstName).toBe("Amy");
  });

  it("returns null when no row matches", async () => {
    mockedGetRange.mockResolvedValue([cleanerRow({ "Cleaner ID": "CLNR-A" })]);
    const repo = new GoogleSheetsCleanerRepository();
    expect(await repo.getCleanerById("CLNR-MISSING")).toBeNull();
  });
});

describe("GoogleSheetsCleanerRepository.getLatestAssignmentForBooking", () => {
  it("returns the LAST matching row, not the first — history must never be mistaken for the current assignment", async () => {
    // Booking ID column read (first getRange call), then the full-row read
    // for the resolved row index (second getRange call).
    mockedGetRange
      .mockResolvedValueOnce([["BELA-1"], ["BELA-2"], ["BELA-1"], ["BELA-1"]]) // 3 rows match BELA-1: indices 0, 2, 3
      .mockResolvedValueOnce([assignmentRow({ "Assignment ID": "ASGN-LATEST", "Booking ID": "BELA-1", Status: "Pending" })]);

    const repo = new GoogleSheetsCleanerRepository();
    const result = await repo.getLatestAssignmentForBooking("BELA-1");

    expect(result?.assignmentId).toBe("ASGN-LATEST");
    // sheetRow = lastMatchIndex(3) + 2 = 5
    expect(mockedGetRange).toHaveBeenLastCalledWith(expect.stringContaining("!A5:"));
  });

  it("returns null when no assignment has ever been offered for the booking", async () => {
    mockedGetRange.mockResolvedValueOnce([["BELA-OTHER"]]);
    const repo = new GoogleSheetsCleanerRepository();
    expect(await repo.getLatestAssignmentForBooking("BELA-1")).toBeNull();
  });
});

describe("GoogleSheetsCleanerRepository.createAssignment", () => {
  it("appends a new row in exact column order, never overwriting anything", async () => {
    const update: CreateAssignmentUpdate = {
      assignmentId: "ASGN-1",
      bookingId: "BELA-1",
      cleanerId: "CLNR-A",
      cleanerName: "Susie Smith",
      status: "Pending",
      offeredAt: "01/01/2026, 12:00:00 PM EST",
      responseDeadline: "2026-01-02T12:00:00.000Z",
      cleaningTotalSnapshot: 190.5,
      payoutPercentageSnapshot: 0.6,
      payoutAmountSnapshot: 114.3,
      assignmentTokenHash: "abc123",
    };
    const repo = new GoogleSheetsCleanerRepository();
    await repo.createAssignment(update);

    expect(mockedAppendRow).toHaveBeenCalledTimes(1);
    const [range, row] = mockedAppendRow.mock.calls[0];
    expect(range).toContain("Cleaner Assignments!");
    expect(row).toEqual([
      "ASGN-1",
      "BELA-1",
      "CLNR-A",
      "Susie Smith",
      "Pending",
      "01/01/2026, 12:00:00 PM EST",
      "2026-01-02T12:00:00.000Z",
      "",
      "",
      "",
      190.5,
      0.6,
      114.3,
      "abc123",
      "",
      "",
      0,
      "",
    ]);
  });
});

describe("GoogleSheetsCleanerRepository.findAssignmentByTokenHash", () => {
  it("finds the row whose hash matches via timing-safe comparison", async () => {
    const hash = hashManageToken("some-raw-token-value-1234567890123456789012");
    mockedGetRange
      .mockResolvedValueOnce([["wrong-hash"], [hash]])
      .mockResolvedValueOnce([assignmentRow({ "Assignment ID": "ASGN-FOUND", "Assignment Token Hash": hash })]);

    const repo = new GoogleSheetsCleanerRepository();
    const result = await repo.findAssignmentByTokenHash(hash);
    expect(result?.assignmentId).toBe("ASGN-FOUND");
  });

  it("returns null for a hash that matches nothing", async () => {
    mockedGetRange.mockResolvedValueOnce([["a".repeat(64)], ["b".repeat(64)]]);
    const repo = new GoogleSheetsCleanerRepository();
    expect(await repo.findAssignmentByTokenHash("c".repeat(64))).toBeNull();
  });
});

describe("GoogleSheetsCleanerRepository.updateAssignmentResolution", () => {
  it("writes Status and the Accepted/Declined/Expired span in one batch, by Assignment ID row", async () => {
    mockedGetRange.mockResolvedValueOnce([["ASGN-OTHER"], ["ASGN-1"]]); // ASGN-1 is row index 1 -> sheet row 3
    const repo = new GoogleSheetsCleanerRepository();

    await repo.updateAssignmentResolution("ASGN-1", { status: "Accepted", acceptedAt: "some time", declinedAt: "", expiredAt: "" });

    expect(mockedBatchUpdateRanges).toHaveBeenCalledTimes(1);
    const updates = mockedBatchUpdateRanges.mock.calls[0][0];
    expect(updates[0]).toEqual({ range: expect.stringContaining("!E3"), row: ["Accepted"] });
    expect(updates[1]).toEqual({ range: expect.stringContaining("!H3:J3"), row: ["some time", "", ""] });
  });
});

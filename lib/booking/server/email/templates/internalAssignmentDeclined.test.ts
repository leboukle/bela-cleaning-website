import { describe, it, expect } from "vitest";
import { buildInternalAssignmentDeclinedEmail } from "./internalAssignmentDeclined";
import { sampleBookingRecord } from "../../testFixtures";
import type { AssignmentRecord } from "../../cleanerTypes";

function fakeAssignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return {
    assignmentId: "ASGN-1",
    bookingId: "BELA-20260101-ABCDEF",
    cleanerId: "CLNR-AAAAAA",
    cleanerName: "Susie Smith",
    status: "Declined",
    offeredAt: "01/01/2026, 12:00:00 PM EST",
    responseDeadline: "",
    acceptedAt: "",
    declinedAt: "01/01/2026, 1:00:00 PM EST",
    expiredAt: "",
    cleaningTotalSnapshot: 190.5,
    payoutPercentageSnapshot: 0.6,
    payoutAmountSnapshot: 114.3,
    assignmentTokenHash: "hash",
    cleanerReminderStatus: "",
    cleanerReminderSentAt: "",
    cleanerReminderAttempts: 0,
    payoutStatementSentAt: "",
    ...overrides,
  };
}

describe("buildInternalAssignmentDeclinedEmail", () => {
  it("states the cleaner name, Booking ID, and service date/time in a human-readable sentence", () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF", serviceDate: "2026-09-18", serviceStartTime: "10:00", arrivalWindow: "" });
    const email = buildInternalAssignmentDeclinedEmail(record, fakeAssignment({ cleanerName: "Susie Smith" }));
    expect(email.text).toContain("Susie Smith declined cleaning assignment BELA-20260101-ABCDEF");
    expect(email.text).toContain("September 18, 2026");
    expect(email.text).toContain("10:00 AM");
  });

  it("includes the Booking ID in the subject line and flags that a new assignment is needed", () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF" });
    const email = buildInternalAssignmentDeclinedEmail(record, fakeAssignment());
    expect(email.subject).toContain("BELA-20260101-ABCDEF");
    expect(email.text.toLowerCase()).toContain("needs a new cleaner assignment");
  });
});

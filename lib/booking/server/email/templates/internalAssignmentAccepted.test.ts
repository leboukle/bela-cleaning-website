import { describe, it, expect } from "vitest";
import { buildInternalAssignmentAcceptedEmail } from "./internalAssignmentAccepted";
import { sampleBookingRecord } from "../../testFixtures";
import type { AssignmentRecord } from "../../cleanerTypes";

function fakeAssignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return {
    assignmentId: "ASGN-1",
    bookingId: "BELA-20260101-ABCDEF",
    cleanerId: "CLNR-AAAAAA",
    cleanerName: "Susie Smith",
    status: "Accepted",
    offeredAt: "01/01/2026, 12:00:00 PM EST",
    responseDeadline: "",
    acceptedAt: "01/01/2026, 1:00:00 PM EST",
    declinedAt: "",
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

describe("buildInternalAssignmentAcceptedEmail", () => {
  it("states the cleaner name, Booking ID, and service date/time in a human-readable sentence", () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF", serviceDate: "2026-09-18", serviceStartTime: "10:00", arrivalWindow: "" });
    const email = buildInternalAssignmentAcceptedEmail(record, fakeAssignment({ cleanerName: "Susie Smith" }));
    expect(email.text).toContain("Susie Smith accepted cleaning assignment BELA-20260101-ABCDEF");
    expect(email.text).toContain("September 18, 2026");
    expect(email.text).toContain("10:00 AM");
  });

  it("includes the Booking ID in the subject line", () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF" });
    const email = buildInternalAssignmentAcceptedEmail(record, fakeAssignment());
    expect(email.subject).toContain("BELA-20260101-ABCDEF");
  });

  it("includes the cleaning total and payout amount", () => {
    const email = buildInternalAssignmentAcceptedEmail(sampleBookingRecord(), fakeAssignment({ cleaningTotalSnapshot: 190.5, payoutAmountSnapshot: 114.3 }));
    expect(email.text).toContain("$190.50");
    expect(email.text).toContain("$114.30");
  });
});

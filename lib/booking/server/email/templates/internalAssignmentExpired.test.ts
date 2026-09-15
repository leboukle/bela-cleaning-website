import { describe, it, expect } from "vitest";
import { buildInternalAssignmentExpiredEmail } from "./internalAssignmentExpired";
import { sampleBookingRecord } from "../../testFixtures";
import type { AssignmentRecord } from "../../cleanerTypes";

function fakeAssignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return {
    assignmentId: "ASGN-1",
    bookingId: "BELA-20260101-ABCDEF",
    cleanerId: "CLNR-AAAAAA",
    cleanerName: "Susie Smith",
    status: "Expired",
    offeredAt: "01/01/2026, 12:00:00 PM EST",
    responseDeadline: "",
    acceptedAt: "",
    declinedAt: "",
    expiredAt: "01/02/2026, 12:00:00 PM EST",
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

describe("buildInternalAssignmentExpiredEmail", () => {
  it("states no response was received, with Booking ID and cleaner name", () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF" });
    const email = buildInternalAssignmentExpiredEmail(record, fakeAssignment({ cleanerName: "Susie Smith" }));
    expect(email.text).toContain("Susie Smith");
    expect(email.text).toContain("BELA-20260101-ABCDEF");
    expect(email.text.toLowerCase()).toContain("expired with no response");
  });

  it("includes the Booking ID in the subject line and flags that a new assignment is needed", () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF" });
    const email = buildInternalAssignmentExpiredEmail(record, fakeAssignment());
    expect(email.subject).toContain("BELA-20260101-ABCDEF");
    expect(email.text.toLowerCase()).toContain("needs a new cleaner assignment");
  });
});

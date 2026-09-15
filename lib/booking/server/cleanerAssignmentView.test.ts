import { describe, it, expect } from "vitest";
import { buildCleanerAssignmentView } from "./cleanerAssignmentView";
import { ASSIGNMENT_STATUS } from "./cleanerSheetSchema";
import { sampleBookingRecord } from "./testFixtures";
import type { AssignmentRecord } from "./cleanerTypes";

function fakeAssignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return {
    assignmentId: "ASGN-1",
    bookingId: "BELA-1",
    cleanerId: "CLNR-AAAAAA",
    cleanerName: "Susie Smith",
    status: ASSIGNMENT_STATUS.PENDING,
    offeredAt: "",
    responseDeadline: new Date("2026-03-01T12:00:00.000Z").toISOString(),
    acceptedAt: "",
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

describe("buildCleanerAssignmentView", () => {
  it("never includes customer email, mobile, or any Stripe field (the view type itself has no such fields)", () => {
    const record = sampleBookingRecord({
      email: "customer@example.com",
      mobile: "5551234567",
      stripeCustomerId: "cus_x",
      stripePaymentMethodId: "pm_x",
    });
    const view = buildCleanerAssignmentView(record, fakeAssignment(), new Date("2026-01-01T00:00:00.000Z"));
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("customer@example.com");
    expect(serialized).not.toContain("5551234567");
    expect(serialized).not.toContain("cus_x");
    expect(serialized).not.toContain("pm_x");
  });

  it("exposes only the customer's first name, not last name", () => {
    const record = sampleBookingRecord({ firstName: "Jane", lastName: "Doe" });
    const view = buildCleanerAssignmentView(record, fakeAssignment());
    expect(view.customerFirstName).toBe("Jane");
    expect(JSON.stringify(view)).not.toContain("Doe");
  });

  it("carries the payout snapshot from the assignment, not a live recomputation", () => {
    const view = buildCleanerAssignmentView(sampleBookingRecord(), fakeAssignment({ cleaningTotalSnapshot: 200, payoutPercentageSnapshot: 0.5, payoutAmountSnapshot: 100 }));
    expect(view.cleaningTotal).toBe(200);
    expect(view.payoutPercentage).toBe(0.5);
    expect(view.payoutAmount).toBe(100);
  });

  it("canRespond is true for a Pending assignment before its deadline", () => {
    const now = new Date("2026-02-01T00:00:00.000Z"); // before the fake's March 1 deadline
    const view = buildCleanerAssignmentView(sampleBookingRecord(), fakeAssignment(), now);
    expect(view.canRespond).toBe(true);
  });

  it("canRespond is false for a Pending assignment past its deadline", () => {
    const now = new Date("2026-04-01T00:00:00.000Z"); // after the fake's March 1 deadline
    const view = buildCleanerAssignmentView(sampleBookingRecord(), fakeAssignment(), now);
    expect(view.canRespond).toBe(false);
  });

  it("canRespond is false for an already-Accepted assignment", () => {
    const view = buildCleanerAssignmentView(sampleBookingRecord(), fakeAssignment({ status: ASSIGNMENT_STATUS.ACCEPTED }), new Date("2026-01-01T00:00:00.000Z"));
    expect(view.canRespond).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { buildCleanerPayoutStatementEmail } from "./cleanerPayoutStatement";
import { sampleBookingRecord } from "../../testFixtures";
import type { AssignmentRecord } from "../../cleanerTypes";

function fakeAssignment(overrides: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return {
    assignmentId: "ASGN-1",
    bookingId: "BELA-20260101-ABCDEF",
    cleanerId: "CLNR-AAAAAA",
    cleanerName: "Susie Smith",
    status: "Accepted",
    offeredAt: "",
    responseDeadline: "",
    acceptedAt: "some time",
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

describe("buildCleanerPayoutStatementEmail", () => {
  it("greets the cleaner by first name and thanks them for completing the assignment", () => {
    const email = buildCleanerPayoutStatementEmail(sampleBookingRecord(), "Susie", fakeAssignment());
    expect(email.text).toContain("Hi Susie,");
    expect(email.text).toContain("Thank you for completing your BeLa Cleaning assignment.");
  });

  it("includes Booking ID, service, service date, cleaning total, and payout amount", () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF", cleaningType: "Standard cleaning" });
    const email = buildCleanerPayoutStatementEmail(record, "Susie", fakeAssignment({ cleaningTotalSnapshot: 190.5, payoutAmountSnapshot: 114.3 }));
    expect(email.text).toContain("BELA-20260101-ABCDEF");
    expect(email.text).toContain("Standard cleaning");
    expect(email.text).toContain("$190.50");
    expect(email.text).toContain("$114.30");
    expect(email.subject).toContain("BELA-20260101-ABCDEF");
  });

  it("promises payment within 24 hours, without claiming it has been sent or is on the way", () => {
    const email = buildCleanerPayoutStatementEmail(sampleBookingRecord(), "Susie", fakeAssignment());
    expect(email.text).toContain("Please expect to receive your payment within 24 hours of the completed cleaning.");
    const lowerText = email.text.toLowerCase();
    expect(lowerText).not.toContain("has been sent");
    expect(lowerText).not.toContain("on its way");
    expect(lowerText).not.toContain("on the way");
    expect(lowerText).not.toContain("payment sent");
  });

  it("never mentions tips", () => {
    const email = buildCleanerPayoutStatementEmail(sampleBookingRecord(), "Susie", fakeAssignment());
    expect(email.text.toLowerCase()).not.toContain("tip");
  });

  it("NEVER exposes customer email, phone, or any Stripe/payment identifier", () => {
    const record = sampleBookingRecord({
      email: "customer-should-never-appear@example.com",
      mobile: "5559998888",
      stripeCustomerId: "cus_should_never_appear",
      stripePaymentIntentId: "pi_should_never_appear",
    });
    const email = buildCleanerPayoutStatementEmail(record, "Susie", fakeAssignment());
    const combined = `${email.text}\n${email.html}`;
    expect(combined).not.toContain("customer-should-never-appear@example.com");
    expect(combined).not.toContain("5559998888");
    expect(combined).not.toContain("cus_should_never_appear");
    expect(combined).not.toContain("pi_should_never_appear");
  });
});

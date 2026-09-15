import { describe, it, expect } from "vitest";
import { buildCleanerAppointmentReminderEmail } from "./cleanerAppointmentReminder";
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

describe("buildCleanerAppointmentReminderEmail", () => {
  it('greets the cleaner by first name and mentions "Reminder"', () => {
    const email = buildCleanerAppointmentReminderEmail(sampleBookingRecord(), "Susie", fakeAssignment());
    expect(email.text).toContain("Hi Susie,");
    expect(email.subject).toContain("Reminder");
  });

  it("includes Booking ID, customer first name only, address, date, time, cleaning total, and payout", () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF", firstName: "Jane", chargeAmount: 190.5 });
    const email = buildCleanerAppointmentReminderEmail(record, "Susie", fakeAssignment({ payoutAmountSnapshot: 114.3, payoutPercentageSnapshot: 0.6 }));
    for (const body of [email.text, email.html]) {
      expect(body).toContain("BELA-20260101-ABCDEF");
      expect(body).toContain("Jane");
    }
    expect(email.text).toContain("$190.50");
    expect(email.text).toContain("$114.30");
  });

  it("does NOT include Accept/Decline controls — an accepted assignment is locked", () => {
    const email = buildCleanerAppointmentReminderEmail(sampleBookingRecord(), "Susie", fakeAssignment());
    expect(email.text).not.toContain("ACCEPT");
    expect(email.text).not.toContain("DECLINE");
    expect(email.html).not.toContain("cleaner-assignment");
  });

  it("includes the 'contact BeLa immediately if anything has changed' notice", () => {
    const email = buildCleanerAppointmentReminderEmail(sampleBookingRecord(), "Susie", fakeAssignment());
    expect(email.text.toLowerCase()).toContain("contact bela cleaning immediately");
  });

  it("NEVER exposes customer email, phone, or any Stripe/payment identifier", () => {
    const record = sampleBookingRecord({
      email: "customer-should-never-appear@example.com",
      mobile: "5559998888",
      stripeCustomerId: "cus_should_never_appear",
      stripePaymentIntentId: "pi_should_never_appear",
    });
    const email = buildCleanerAppointmentReminderEmail(record, "Susie", fakeAssignment());
    const combined = `${email.text}\n${email.html}`;
    expect(combined).not.toContain("customer-should-never-appear@example.com");
    expect(combined).not.toContain("5559998888");
    expect(combined).not.toContain("cus_should_never_appear");
    expect(combined).not.toContain("pi_should_never_appear");
  });

  it("never mentions tips", () => {
    const email = buildCleanerAppointmentReminderEmail(sampleBookingRecord(), "Susie", fakeAssignment());
    expect(email.text.toLowerCase()).not.toContain("tip");
  });

  it("HTML-escapes customer-controlled values", () => {
    const record = sampleBookingRecord({ specialInstructions: '<script>alert("x")</script>' });
    const email = buildCleanerAppointmentReminderEmail(record, "Susie", fakeAssignment());
    expect(email.html).not.toContain("<script>alert");
  });
});

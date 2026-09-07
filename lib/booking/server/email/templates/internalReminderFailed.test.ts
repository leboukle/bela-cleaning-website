import { describe, it, expect } from "vitest";
import { buildInternalReminderFailedEmail } from "./internalReminderFailed";
import { sampleBookingRecord } from "../../testFixtures";

describe("buildInternalReminderFailedEmail", () => {
  it('builds the subject as "Appointment reminder FAILED — [BOOKING ID]"', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-1" });
    const email = buildInternalReminderFailedEmail(record, 3);
    expect(email.subject).toBe("Appointment reminder FAILED — BELA-1");
  });

  it("includes the total attempt count and states no further automatic retries", () => {
    const record = sampleBookingRecord();
    const email = buildInternalReminderFailedEmail(record, 3);
    expect(email.text).toContain("3");
    expect(email.text).toContain("No further automatic attempts will be made");
  });

  it("includes the customer name and service date", () => {
    const record = sampleBookingRecord({ firstName: "Jane", lastName: "Doe", serviceDate: "2026-09-22" });
    const email = buildInternalReminderFailedEmail(record, 3);
    expect(email.text).toContain("Jane Doe");
    expect(email.text).toContain("2026-09-22");
  });

  it("HTML-escapes customer-controlled values in the html body", () => {
    const record = sampleBookingRecord({ firstName: '<script>alert("x")</script>' });
    const email = buildInternalReminderFailedEmail(record, 3);
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

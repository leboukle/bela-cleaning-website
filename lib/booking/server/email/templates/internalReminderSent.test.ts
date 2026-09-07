import { describe, it, expect } from "vitest";
import { buildInternalReminderSentEmail } from "./internalReminderSent";
import { sampleBookingRecord } from "../../testFixtures";

describe("buildInternalReminderSentEmail", () => {
  it('builds the subject as "Appointment reminder sent — [BOOKING ID]"', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-1" });
    const email = buildInternalReminderSentEmail(record);
    expect(email.subject).toBe("Appointment reminder sent — BELA-1");
  });

  it("includes the customer name, service date, appointment time, and Sent At timestamp", () => {
    const record = sampleBookingRecord({
      firstName: "Jane",
      lastName: "Doe",
      serviceDate: "2026-09-22",
      appointmentReminderSentAt: "2026-09-19T12:00:00.000Z",
    });
    const email = buildInternalReminderSentEmail(record);
    expect(email.text).toContain("Jane Doe");
    expect(email.text).toContain("2026-09-22");
    expect(email.text).toContain("2026-09-19T12:00:00.000Z");
  });

  it("HTML-escapes customer-controlled values in the html body", () => {
    const record = sampleBookingRecord({ firstName: '<script>alert("x")</script>' });
    const email = buildInternalReminderSentEmail(record);
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

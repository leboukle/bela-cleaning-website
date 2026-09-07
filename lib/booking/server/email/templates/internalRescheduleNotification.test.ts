import { describe, it, expect } from "vitest";
import { buildInternalRescheduleEmail } from "./internalRescheduleNotification";
import { sampleBookingRecord } from "../../testFixtures";

const CHANGE = { oldServiceDate: "2026-09-01", oldArrivalWindow: "Morning", oldServiceStartTime: "" };

describe("buildInternalRescheduleEmail", () => {
  it('builds the subject as "Booking rescheduled — [BOOKING ID]"', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-1" });
    const email = buildInternalRescheduleEmail(record, CHANGE);
    expect(email.subject).toBe("Booking rescheduled — BELA-1");
  });

  it("includes both the old and new date/arrival window", () => {
    const record = sampleBookingRecord({ serviceDate: "2026-10-15", arrivalWindow: "Afternoon" });
    const email = buildInternalRescheduleEmail(record, CHANGE);
    expect(email.text).toContain("2026-09-01");
    expect(email.text).toContain("Morning");
    expect(email.text).toContain("2026-10-15");
    expect(email.text).toContain("Afternoon");
  });

  it("includes the customer name and the Rescheduled At timestamp", () => {
    const record = sampleBookingRecord({ firstName: "Jane", lastName: "Doe", rescheduledAt: "2026-09-15T09:00:00.000Z" });
    const email = buildInternalRescheduleEmail(record, CHANGE);
    expect(email.text).toContain("Jane Doe");
    expect(email.text).toContain("2026-09-15T09:00:00.000Z");
  });

  it("HTML-escapes customer-controlled values in the html body", () => {
    const record = sampleBookingRecord({ firstName: '<script>alert("x")</script>' });
    const email = buildInternalRescheduleEmail(record, CHANGE);
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

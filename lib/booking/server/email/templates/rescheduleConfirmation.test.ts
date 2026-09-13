import { describe, it, expect } from "vitest";
import { buildRescheduleConfirmationEmail } from "./rescheduleConfirmation";
import { sampleBookingRecord } from "../../testFixtures";

const CHANGE = { oldServiceDate: "2026-09-01", oldArrivalWindow: "Morning", oldServiceStartTime: "" };

describe("buildRescheduleConfirmationEmail", () => {
  it('builds the subject as "BeLa Cleaning — Booking [BOOKING ID] rescheduled"', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF" });
    const email = buildRescheduleConfirmationEmail(record, CHANGE);
    expect(email.subject).toBe("BeLa Cleaning — Booking BELA-20260101-ABCDEF rescheduled");
  });

  it("includes both the old and new date/arrival window", () => {
    const record = sampleBookingRecord({ serviceDate: "2026-10-15", arrivalWindow: "Afternoon" });
    const email = buildRescheduleConfirmationEmail(record, CHANGE);
    for (const body of [email.text, email.html]) {
      expect(body).toContain("Morning");
      expect(body).toContain("Afternoon");
    }
  });

  it("states no rescheduling fee applies and the total is unchanged", () => {
    const record = sampleBookingRecord();
    const email = buildRescheduleConfirmationEmail(record, CHANGE);
    expect(email.text.toLowerCase()).toContain("no rescheduling fee");
  });

  it("never exposes any Stripe identifier", () => {
    const record = sampleBookingRecord({
      stripeCustomerId: "cus_should_never_appear",
      stripePaymentMethodId: "pm_should_never_appear",
      stripeSetupIntentId: "seti_should_never_appear",
      stripePaymentIntentId: "pi_should_never_appear",
    });
    const email = buildRescheduleConfirmationEmail(record, CHANGE);
    const combined = `${email.text}\n${email.html}`;
    expect(combined).not.toContain("cus_should_never_appear");
    expect(combined).not.toContain("pm_should_never_appear");
    expect(combined).not.toContain("seti_should_never_appear");
    expect(combined).not.toContain("pi_should_never_appear");
  });

  it("HTML-escapes customer-controlled values in the html body", () => {
    const record = sampleBookingRecord({ firstName: '<script>alert("x")</script>' });
    const email = buildRescheduleConfirmationEmail(record, CHANGE);
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

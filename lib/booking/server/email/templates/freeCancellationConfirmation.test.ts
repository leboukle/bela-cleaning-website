import { describe, it, expect } from "vitest";
import { buildFreeCancellationConfirmationEmail } from "./freeCancellationConfirmation";
import { sampleBookingRecord } from "../../testFixtures";

describe("buildFreeCancellationConfirmationEmail", () => {
  it('builds the subject as "BeLa Cleaning — Booking [BOOKING ID] cancelled"', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF" });
    const email = buildFreeCancellationConfirmationEmail(record);
    expect(email.subject).toBe("BeLa Cleaning — Booking BELA-20260101-ABCDEF cancelled");
  });

  it("includes the booking ID and appointment details in both bodies", () => {
    const record = sampleBookingRecord();
    const email = buildFreeCancellationConfirmationEmail(record);
    for (const body of [email.text, email.html]) {
      expect(body).toContain(record.bookingId);
      expect(body).toContain(record.arrivalWindow);
    }
  });

  it("shows the exact appointment time for a Milestone 6 exact-time booking (never a blank Arrival Window)", () => {
    const record = sampleBookingRecord({ arrivalWindow: "", serviceStartTime: "09:00" });
    const email = buildFreeCancellationConfirmationEmail(record);
    expect(email.text).toContain("9:00 AM");
    expect(email.text).not.toContain("()");
  });

  it("falls back to the legacy Arrival Window label for a pre-amendment booking", () => {
    const record = sampleBookingRecord({ arrivalWindow: "Afternoon", serviceStartTime: "" });
    const email = buildFreeCancellationConfirmationEmail(record);
    expect(email.text).toContain("Afternoon (2:00 PM – 4:00 PM)");
  });

  it("states plainly that no charge was made — never mentions a fee amount", () => {
    const record = sampleBookingRecord({ cancellationFeeAmount: 0 });
    const email = buildFreeCancellationConfirmationEmail(record);
    expect(email.text.toLowerCase()).toContain("no charge has been made");
    expect(email.text.toLowerCase()).not.toMatch(/\bfee\b/);
  });

  it("never exposes any Stripe identifier", () => {
    const record = sampleBookingRecord({
      stripeCustomerId: "cus_should_never_appear",
      stripePaymentMethodId: "pm_should_never_appear",
      stripeSetupIntentId: "seti_should_never_appear",
      stripePaymentIntentId: "pi_should_never_appear",
    });
    const email = buildFreeCancellationConfirmationEmail(record);
    const combined = `${email.text}\n${email.html}`;
    expect(combined).not.toContain("cus_should_never_appear");
    expect(combined).not.toContain("pm_should_never_appear");
    expect(combined).not.toContain("seti_should_never_appear");
    expect(combined).not.toContain("pi_should_never_appear");
  });

  it("HTML-escapes customer-controlled values in the html body", () => {
    const record = sampleBookingRecord({ firstName: '<script>alert("x")</script>' });
    const email = buildFreeCancellationConfirmationEmail(record);
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

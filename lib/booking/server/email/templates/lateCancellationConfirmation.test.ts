import { describe, it, expect } from "vitest";
import { buildLateCancellationConfirmationEmail } from "./lateCancellationConfirmation";
import { sampleBookingRecord } from "../../testFixtures";

describe("buildLateCancellationConfirmationEmail", () => {
  it('builds a subject that flags the late-cancellation fee', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF" });
    const email = buildLateCancellationConfirmationEmail(record);
    expect(email.subject).toBe("BeLa Cleaning — Booking BELA-20260101-ABCDEF cancelled (late-cancellation fee applies)");
  });

  it("states the fee amount and the 50% policy", () => {
    const record = sampleBookingRecord({ cancellationFeeAmount: 95.25 });
    const email = buildLateCancellationConfirmationEmail(record);
    expect(email.text).toContain("$95.25");
    expect(email.text).toContain("50% of your booking total");
  });

  it('says the fee "will be charged" — never claims it has already succeeded', () => {
    const record = sampleBookingRecord({ cancellationFeeAmount: 50 });
    const email = buildLateCancellationConfirmationEmail(record);
    const lowerText = email.text.toLowerCase();
    expect(lowerText).toContain("will be charged");
    expect(lowerText).not.toContain("has been charged");
    expect(lowerText).not.toContain("was charged");
    expect(lowerText).not.toContain("payment has been collected");
  });

  it("shows the exact appointment time for a Milestone 6 exact-time booking (never a blank Arrival Window)", () => {
    const record = sampleBookingRecord({ arrivalWindow: "", serviceStartTime: "09:00" });
    const email = buildLateCancellationConfirmationEmail(record);
    expect(email.text).toContain("9:00 AM");
    expect(email.text).not.toContain("()");
  });

  it("falls back to the legacy Arrival Window label for a pre-amendment booking", () => {
    const record = sampleBookingRecord({ arrivalWindow: "Afternoon", serviceStartTime: "" });
    const email = buildLateCancellationConfirmationEmail(record);
    expect(email.text).toContain("Afternoon (2:00 PM – 4:00 PM)");
  });

  it("mentions BeLa's discretion to waive or reduce the fee", () => {
    const record = sampleBookingRecord();
    const email = buildLateCancellationConfirmationEmail(record);
    expect(email.text.toLowerCase()).toContain("waive");
  });

  it("never exposes any Stripe identifier", () => {
    const record = sampleBookingRecord({
      stripeCustomerId: "cus_should_never_appear",
      stripePaymentMethodId: "pm_should_never_appear",
      stripeSetupIntentId: "seti_should_never_appear",
      stripePaymentIntentId: "pi_should_never_appear",
    });
    const email = buildLateCancellationConfirmationEmail(record);
    const combined = `${email.text}\n${email.html}`;
    expect(combined).not.toContain("cus_should_never_appear");
    expect(combined).not.toContain("pm_should_never_appear");
    expect(combined).not.toContain("seti_should_never_appear");
    expect(combined).not.toContain("pi_should_never_appear");
  });

  it("HTML-escapes customer-controlled values in the html body", () => {
    const record = sampleBookingRecord({ firstName: '<script>alert("x")</script>' });
    const email = buildLateCancellationConfirmationEmail(record);
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

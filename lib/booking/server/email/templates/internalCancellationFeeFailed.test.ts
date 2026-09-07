import { describe, it, expect } from "vitest";
import { buildInternalCancellationFeeFailedEmail } from "./internalCancellationFeeFailed";
import { sampleBookingRecord } from "../../testFixtures";

describe("buildInternalCancellationFeeFailedEmail", () => {
  it('builds the subject as "Cancellation fee FAILED — [BOOKING ID]"', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-1" });
    const email = buildInternalCancellationFeeFailedEmail(record, { type: "card_error", code: "card_declined", declineCode: "insufficient_funds" });
    expect(email.subject).toBe("Cancellation fee FAILED — BELA-1");
  });

  it("includes the raw Stripe decline detail for staff visibility", () => {
    const record = sampleBookingRecord();
    const email = buildInternalCancellationFeeFailedEmail(record, { type: "card_error", code: "card_declined", declineCode: "lost_card" });
    expect(email.text).toContain("card_error");
    expect(email.text).toContain("card_declined");
    expect(email.text).toContain("lost_card");
  });

  it("states the booking remains Cancelled and requires manual follow-up, with no automatic retry", () => {
    const record = sampleBookingRecord({ bookingStatus: "Cancelled" });
    const email = buildInternalCancellationFeeFailedEmail(record, { type: null, code: null, declineCode: null });
    expect(email.text).toContain("The booking remains Cancelled");
    expect(email.text).toContain("No automatic retry will be attempted");
  });

  it("includes the fee amount", () => {
    const record = sampleBookingRecord({ cancellationFeeAmount: 60 });
    const email = buildInternalCancellationFeeFailedEmail(record, { type: null, code: null, declineCode: null });
    expect(email.text).toContain("$60");
  });

  it("HTML-escapes customer-controlled values in the html body", () => {
    const record = sampleBookingRecord({ firstName: '<script>alert("x")</script>' });
    const email = buildInternalCancellationFeeFailedEmail(record, { type: null, code: null, declineCode: null });
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

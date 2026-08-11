import { describe, it, expect } from "vitest";
import { buildInternalPaymentFailedEmail } from "./internalPaymentFailed";
import { sampleBookingRecord } from "../../testFixtures";

describe("buildInternalPaymentFailedEmail", () => {
  it('describes a retryable failure that scheduled a retry as "an automatic retry has been scheduled"', () => {
    const record = sampleBookingRecord({ paymentStatus: "Retry Scheduled", paymentAttemptCount: 1 });
    const email = buildInternalPaymentFailedEmail(record, {
      classification: "retryable",
      failure: { type: "card_error", code: "card_declined", declineCode: "generic_decline" },
    });
    expect(email.text).toContain("an automatic retry has been scheduled");
    expect(email.text).not.toContain("retry limit exhausted");
  });

  it('describes a retryable failure that exhausted the cadence as "retry limit exhausted", not "retry has been scheduled"', () => {
    const record = sampleBookingRecord({ paymentStatus: "Final Failure", paymentAttemptCount: 4 });
    const email = buildInternalPaymentFailedEmail(record, {
      classification: "retryable",
      failure: { type: "card_error", code: "card_declined", declineCode: "generic_decline" },
    });
    expect(email.text).toContain("Retryable decline — retry limit exhausted; no further automatic attempts will be made.");
    expect(email.text).not.toContain("an automatic retry has been scheduled");
  });

  it('describes a non-retryable failure as a hard decline with no further attempts', () => {
    const record = sampleBookingRecord({ paymentStatus: "Final Failure", paymentAttemptCount: 1 });
    const email = buildInternalPaymentFailedEmail(record, {
      classification: "non-retryable",
      failure: { type: "card_error", code: "card_declined", declineCode: "stolen_card" },
    });
    expect(email.text).toContain("Non-retryable — this is a hard decline");
  });

  it("describes a requires-action failure as needing customer authentication", () => {
    const record = sampleBookingRecord({ paymentStatus: "Requires Action", paymentAttemptCount: 1 });
    const email = buildInternalPaymentFailedEmail(record, {
      classification: "requires-action",
      failure: { type: "card_error", code: "authentication_required", declineCode: null },
    });
    expect(email.text).toContain("Requires customer action");
  });

  it("includes the raw Stripe decline detail for staff visibility", () => {
    const record = sampleBookingRecord({ paymentStatus: "Retry Scheduled" });
    const email = buildInternalPaymentFailedEmail(record, {
      classification: "retryable",
      failure: { type: "card_error", code: "card_declined", declineCode: "insufficient_funds" },
    });
    expect(email.text).toContain("insufficient_funds");
  });
});

import { describe, it, expect } from "vitest";
import { classifyPaymentFailure } from "./paymentFailureClassification";

describe("classifyPaymentFailure", () => {
  it("classifies authentication_required as requires-action even when a decline code is also present", () => {
    const result = classifyPaymentFailure({ type: "card_error", code: "authentication_required", declineCode: "generic_decline" });
    expect(result).toEqual({ classification: "requires-action", recognized: true });
  });

  it("classifies a transient decline code (insufficient_funds) as retryable", () => {
    const result = classifyPaymentFailure({ type: "card_error", code: "card_declined", declineCode: "insufficient_funds" });
    expect(result).toEqual({ classification: "retryable", recognized: true });
  });

  it("classifies a hard decline code (stolen_card) as non-retryable", () => {
    const result = classifyPaymentFailure({ type: "card_error", code: "card_declined", declineCode: "stolen_card" });
    expect(result).toEqual({ classification: "non-retryable", recognized: true });
  });

  it("classifies a stale-card error code (expired_card) as non-retryable even with no decline code", () => {
    const result = classifyPaymentFailure({ type: "card_error", code: "expired_card", declineCode: null });
    expect(result).toEqual({ classification: "non-retryable", recognized: true });
  });

  it("classifies invalid_request_error as non-retryable", () => {
    const result = classifyPaymentFailure({ type: "invalid_request_error", code: null, declineCode: null });
    expect(result).toEqual({ classification: "non-retryable", recognized: true });
  });

  it("classifies api_error as retryable", () => {
    const result = classifyPaymentFailure({ type: "api_error", code: null, declineCode: null });
    expect(result).toEqual({ classification: "retryable", recognized: true });
  });

  it("falls back to retryable with recognized:false for a completely unknown failure shape", () => {
    const result = classifyPaymentFailure({ type: null, code: null, declineCode: null });
    expect(result).toEqual({ classification: "retryable", recognized: false });
  });

  it("falls back to retryable with recognized:false for an unrecognized decline code", () => {
    const result = classifyPaymentFailure({ type: "card_error", code: "card_declined", declineCode: "some_future_stripe_code" });
    expect(result).toEqual({ classification: "retryable", recognized: false });
  });
});

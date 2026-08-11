import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./stripeConfig", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "./stripeConfig";
import { createOffSessionPaymentIntent } from "./paymentIntent";

const mockedGetStripeClient = vi.mocked(getStripeClient);

function fakeStripe() {
  return { paymentIntents: { create: vi.fn() } };
}

const BASE_INPUT = {
  customerId: "cus_123",
  paymentMethodId: "pm_456",
  amountCents: 19050,
  bookingId: "BELA-20260101-ABCDEF",
  serviceDate: "2026-02-15",
  idempotencyKey: "charge:BELA-20260101-ABCDEF:attempt:1",
};

beforeEach(() => {
  mockedGetStripeClient.mockReset();
});

describe("createOffSessionPaymentIntent", () => {
  it("returns succeeded with the PaymentIntent ID when confirmation succeeds immediately", async () => {
    const stripe = fakeStripe();
    stripe.paymentIntents.create.mockResolvedValue({ id: "pi_123", status: "succeeded" });
    mockedGetStripeClient.mockReturnValue(stripe as never);

    const result = await createOffSessionPaymentIntent(BASE_INPUT);
    expect(result).toEqual({ outcome: "succeeded", paymentIntentId: "pi_123" });
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 19050,
        currency: "usd",
        customer: "cus_123",
        payment_method: "pm_456",
        off_session: true,
        confirm: true,
      }),
      { idempotencyKey: BASE_INPUT.idempotencyKey },
    );
  });

  it("returns requires_action when the PaymentIntent needs further authentication", async () => {
    const stripe = fakeStripe();
    stripe.paymentIntents.create.mockResolvedValue({ id: "pi_123", status: "requires_action" });
    mockedGetStripeClient.mockReturnValue(stripe as never);

    const result = await createOffSessionPaymentIntent(BASE_INPUT);
    expect(result).toEqual({ outcome: "requires_action", paymentIntentId: "pi_123" });
  });

  it("returns failed with the extracted decline detail when Stripe throws a card error", async () => {
    const stripe = fakeStripe();
    stripe.paymentIntents.create.mockRejectedValue({
      type: "card_error",
      code: "card_declined",
      decline_code: "insufficient_funds",
      payment_intent: { id: "pi_789" },
    });
    mockedGetStripeClient.mockReturnValue(stripe as never);

    const result = await createOffSessionPaymentIntent(BASE_INPUT);
    expect(result).toEqual({
      outcome: "failed",
      paymentIntentId: "pi_789",
      error: { type: "card_error", code: "card_declined", declineCode: "insufficient_funds" },
    });
  });

  it("returns failed with a null PaymentIntent ID when Stripe throws before creating any object", async () => {
    const stripe = fakeStripe();
    stripe.paymentIntents.create.mockRejectedValue(new Error("network timeout"));
    mockedGetStripeClient.mockReturnValue(stripe as never);

    const result = await createOffSessionPaymentIntent(BASE_INPUT);
    expect(result).toEqual({
      outcome: "failed",
      paymentIntentId: null,
      error: { type: null, code: null, declineCode: null },
    });
  });

  it("passes the given idempotency key through to Stripe unchanged", async () => {
    const stripe = fakeStripe();
    stripe.paymentIntents.create.mockResolvedValue({ id: "pi_123", status: "succeeded" });
    mockedGetStripeClient.mockReturnValue(stripe as never);

    await createOffSessionPaymentIntent({ ...BASE_INPUT, idempotencyKey: "charge:BELA-20260101-ABCDEF:attempt:2" });
    expect(stripe.paymentIntents.create.mock.calls[0][1]).toEqual({ idempotencyKey: "charge:BELA-20260101-ABCDEF:attempt:2" });
  });
});

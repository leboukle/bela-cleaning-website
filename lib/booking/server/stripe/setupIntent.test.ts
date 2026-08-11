import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./stripeConfig", () => ({ getStripeClient: vi.fn() }));

import { getStripeClient } from "./stripeConfig";
import { createBookingSetupIntent, verifySucceededSetupIntent, SetupIntentNotReadyError } from "./setupIntent";

const mockedGetStripeClient = vi.mocked(getStripeClient);

function fakeStripe(overrides: Record<string, unknown> = {}) {
  return {
    customers: { create: vi.fn() },
    setupIntents: { create: vi.fn(), retrieve: vi.fn() },
    ...overrides,
  };
}

beforeEach(() => {
  mockedGetStripeClient.mockReset();
});

describe("createBookingSetupIntent", () => {
  it("creates a fresh Stripe Customer and an off_session SetupIntent, returning its client_secret", async () => {
    const stripe = fakeStripe();
    stripe.customers.create.mockResolvedValue({ id: "cus_123" });
    stripe.setupIntents.create.mockResolvedValue({ id: "seti_123", client_secret: "seti_123_secret_abc" });
    mockedGetStripeClient.mockReturnValue(stripe as never);

    const result = await createBookingSetupIntent({ firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "5551234567" });

    expect(stripe.customers.create).toHaveBeenCalledWith({ name: "Jane Doe", email: "jane@example.com", phone: "5551234567" });
    expect(stripe.setupIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_123", usage: "off_session", payment_method_types: ["card"] }),
    );
    expect(result).toEqual({ clientSecret: "seti_123_secret_abc", setupIntentId: "seti_123", customerId: "cus_123" });
  });

  it("throws if Stripe doesn't return a client_secret", async () => {
    const stripe = fakeStripe();
    stripe.customers.create.mockResolvedValue({ id: "cus_123" });
    stripe.setupIntents.create.mockResolvedValue({ id: "seti_123", client_secret: null });
    mockedGetStripeClient.mockReturnValue(stripe as never);

    await expect(
      createBookingSetupIntent({ firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "5551234567" }),
    ).rejects.toThrow();
  });
});

describe("verifySucceededSetupIntent", () => {
  it("returns customerId and paymentMethodId when both are plain string IDs", async () => {
    const stripe = fakeStripe();
    stripe.setupIntents.retrieve.mockResolvedValue({ status: "succeeded", customer: "cus_123", payment_method: "pm_456" });
    mockedGetStripeClient.mockReturnValue(stripe as never);

    const result = await verifySucceededSetupIntent("seti_123");
    expect(result).toEqual({ customerId: "cus_123", paymentMethodId: "pm_456" });
  });

  it("extracts IDs when Stripe expands customer/payment_method into full objects", async () => {
    const stripe = fakeStripe();
    stripe.setupIntents.retrieve.mockResolvedValue({
      status: "succeeded",
      customer: { id: "cus_123" },
      payment_method: { id: "pm_456" },
    });
    mockedGetStripeClient.mockReturnValue(stripe as never);

    const result = await verifySucceededSetupIntent("seti_123");
    expect(result).toEqual({ customerId: "cus_123", paymentMethodId: "pm_456" });
  });

  it("throws SetupIntentNotReadyError when the SetupIntent hasn't succeeded", async () => {
    const stripe = fakeStripe();
    stripe.setupIntents.retrieve.mockResolvedValue({ status: "requires_payment_method", customer: "cus_123", payment_method: null });
    mockedGetStripeClient.mockReturnValue(stripe as never);

    await expect(verifySucceededSetupIntent("seti_123")).rejects.toThrow(SetupIntentNotReadyError);
  });

  it("throws SetupIntentNotReadyError when succeeded but missing a Customer or PaymentMethod", async () => {
    const stripe = fakeStripe();
    stripe.setupIntents.retrieve.mockResolvedValue({ status: "succeeded", customer: null, payment_method: null });
    mockedGetStripeClient.mockReturnValue(stripe as never);

    await expect(verifySucceededSetupIntent("seti_123")).rejects.toThrow(SetupIntentNotReadyError);
  });
});

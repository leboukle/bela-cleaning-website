// SERVER-ONLY. Creates the Stripe Customer + SetupIntent pair the browser
// needs to mount Stripe's PaymentElement in setup mode. No card data ever
// passes through this module or any other BeLa/Vercel code — Stripe's
// client-side SDK collects it directly into Stripe's own iframe and only
// ever gives the browser a SetupIntent client_secret to work with.
import "server-only";
import { getStripeClient } from "./stripeConfig";

export type CreateSetupIntentInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type CreateSetupIntentResult = {
  clientSecret: string;
  setupIntentId: string;
  customerId: string;
};

/**
 * Always creates a fresh Stripe Customer for this booking attempt rather
 * than searching for a reusable one — this prototype has no customer
 * accounts (explicitly out of scope), so there is no reliable identity to
 * key a "reuse" lookup on beyond email, which isn't a safe uniqueness
 * guarantee (a shared inbox, a typo, etc.). One booking, one Customer, one
 * SetupIntent — simple and correct for the current scope.
 */
export async function createBookingSetupIntent(input: CreateSetupIntentInput): Promise<CreateSetupIntentResult> {
  const stripe = getStripeClient();

  const customer = await stripe.customers.create({
    name: `${input.firstName} ${input.lastName}`.trim(),
    email: input.email,
    phone: input.phone,
  });

  const setupIntent = await stripe.setupIntents.create({
    customer: customer.id,
    // Signals this payment method will later be charged off-session
    // (no customer present), so Stripe performs authentication checks
    // (3D Secure, etc.) now, at setup time, when the customer is actively
    // present to complete them — maximizing the odds the later off-session
    // charge can succeed without needing further authentication.
    usage: "off_session",
    payment_method_types: ["card"],
  });

  if (!setupIntent.client_secret) {
    throw new Error("Stripe did not return a SetupIntent client secret.");
  }

  return {
    clientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id,
    customerId: customer.id,
  };
}

export type ConfirmedSetupIntent = {
  customerId: string;
  paymentMethodId: string;
};

export class SetupIntentNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupIntentNotReadyError";
  }
}

/**
 * Re-verifies a SetupIntent server-side at final booking submission —
 * never trusts the browser's claim that setup succeeded. Confirms the
 * SetupIntent actually reached `succeeded`, and that it has both a
 * Customer and an attached PaymentMethod, which is everything needed to
 * charge later without asking the customer for card details again.
 */
export async function verifySucceededSetupIntent(setupIntentId: string): Promise<ConfirmedSetupIntent> {
  const stripe = getStripeClient();
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

  if (setupIntent.status !== "succeeded") {
    throw new SetupIntentNotReadyError(`SetupIntent is not succeeded (status: ${setupIntent.status}).`);
  }

  const customerId = typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id;
  const paymentMethodId =
    typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method?.id;

  if (!customerId || !paymentMethodId) {
    throw new SetupIntentNotReadyError("Succeeded SetupIntent is missing a Customer or PaymentMethod.");
  }

  return { customerId, paymentMethodId };
}

// SERVER-ONLY. Stripe client configuration — Test mode only this
// milestone (see docs/payments.md's live-mode cutover procedure for what
// changes when that's eventually approved). Fails closed on missing
// configuration, matching every other server-only module in this
// codebase (googleAuth.ts, gmailAuth.ts, settings.ts).
import "server-only";
import Stripe from "stripe";

export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new StripeConfigError(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function getStripeWebhookSecret(): string {
  return requireEnv("STRIPE_WEBHOOK_SECRET");
}

export function getPaymentSchedulerSecret(): string {
  return requireEnv("PAYMENT_SCHEDULER_SECRET");
}

let cachedClient: Stripe | null = null;

/**
 * Memoized per warm serverless instance. The Stripe SDK itself performs no
 * network call at construction time, so this is cheap — memoized purely to
 * avoid re-reading env vars and re-constructing on every call within one
 * instance.
 */
export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;
  const secretKey = requireEnv("STRIPE_SECRET_KEY");
  cachedClient = new Stripe(secretKey);
  return cachedClient;
}

/** Test-only: clears the memoized client so tests can swap mocked env vars. */
export function resetStripeClientForTests(): void {
  cachedClient = null;
}

// Centralized, manually editable values used across the legal pages.
// Update `lastUpdated` whenever Privacy Policy or Terms content changes.

export const legalConfig = {
  privacyLastUpdated: "2026-08-10",
  termsLastUpdated: "2026-08-10",
  // Centralized third-party service-provider names so the legal pages stay
  // accurate if a provider is swapped later (e.g. Formspree replaced with
  // another form processor). Online booking is BeLa's own system as of
  // Milestone 5 — the only third-party provider involved in it is Stripe,
  // which processes and stores payment method information exclusively.
  paymentProcessorName: "Stripe",
  paymentProcessorPrivacyUrl: "https://stripe.com/privacy",
  formProviderName: "Formspree",
  formProviderPrivacyUrl: "https://formspree.io/legal/privacy-policy/",
  hostingProviderName: "Vercel",
} as const;

function formatDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const privacyLastUpdatedDisplay = formatDate(legalConfig.privacyLastUpdated);
export const termsLastUpdatedDisplay = formatDate(legalConfig.termsLastUpdated);

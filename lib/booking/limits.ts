// Shared numeric limits used by both the client-side step component and
// the server-side submission validator, so the two can never drift apart.
export const SPECIAL_INSTRUCTIONS_MAX_LENGTH = 500;

// Sanity bound for extras quantities (interior windows / blinds). The
// client's QuantityStepper defaults to a max of 30 for its own UI, but the
// server accepts a slightly higher ceiling to avoid rejecting a legitimate
// large order while still bounding against absurd/hostile input.
export const EXTRAS_QUANTITY_MAX = 50;

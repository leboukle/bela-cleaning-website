// Client-side validation helpers shared by the customer-info and address
// steps. These are prototype-grade checks meant to catch obvious mistakes
// and keep the guided flow moving — they are NOT a substitute for
// server-side validation. Every field validated here will need to be
// re-validated on the server once a real submission endpoint exists,
// since client-side checks can always be bypassed.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accepts common US mobile-number shapes: "5551234567", "555-123-4567",
// "(555) 123-4567", "555.123.4567", with an optional leading "1"/"+1".
const PHONE_DIGITS_REGEX = /^1?\d{10}$/;

export function trimValue(value: string): string {
  return value.trim();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function isValidUsPhone(phone: string): boolean {
  const digitsOnly = phone.replace(/\D/g, "");
  return PHONE_DIGITS_REGEX.test(digitsOnly);
}

export function formatUsPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^1/, "");
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

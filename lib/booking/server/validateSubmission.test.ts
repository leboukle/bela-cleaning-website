import { describe, it, expect } from "vitest";
import { validateSubmission } from "./validateSubmission";
import type { BookingSubmissionInput } from "./types";

function futureDateKey(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function validInput(overrides: Partial<BookingSubmissionInput> = {}): BookingSubmissionInput {
  return {
    idempotencyToken: "test-token-123",
    honeypot: "",
    propertyType: "apartment",
    propertyTypeOther: "",
    squareFootage: "1001-2000",
    bedrooms: "2",
    bathrooms: "2",
    cleaningType: "standard",
    extras: {
      kitchenCabinets: false,
      refrigerator: false,
      oven: false,
      interiorWindowsQty: 0,
      blindsQty: 0,
      noExtras: true,
    },
    frequency: "one-time",
    zipCode: "07030",
    serviceDate: futureDateKey(30),
    serviceStartTime: "09:00",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    phone: "5551234567",
    addressStreet: "123 Main St",
    addressUnit: "",
    addressCity: "Hoboken",
    addressState: "New Jersey",
    addressZip: "07030",
    someoneHome: "home",
    specialInstructions: "",
    agreedToPolicy: true,
    setupIntentId: "seti_test123",
    ...overrides,
  };
}

describe("validateSubmission", () => {
  it("accepts a fully valid submission", () => {
    const result = validateSubmission(validInput());
    expect(result.ok).toBe(true);
  });

  it("rejects a filled honeypot", () => {
    const result = validateSubmission(validInput({ honeypot: "http://spam.example" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a missing idempotency token", () => {
    const result = validateSubmission(validInput({ idempotencyToken: "" }));
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = validateSubmission(validInput({ email: "not-an-email" }));
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid phone number", () => {
    const result = validateSubmission(validInput({ phone: "123" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed ZIP code", () => {
    const result = validateSubmission(validInput({ addressZip: "ABCDE" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a ZIP code outside the service area", () => {
    const result = validateSubmission(validInput({ addressZip: "99999" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a bedroom option that requires a custom estimate", () => {
    const result = validateSubmission(validInput({ bedrooms: "more-than-5" }));
    expect(result.ok).toBe(false);
  });

  it("rejects extras with noExtras combined with another selection", () => {
    const result = validateSubmission(
      validInput({
        extras: {
          kitchenCabinets: true,
          refrigerator: false,
          oven: false,
          interiorWindowsQty: 0,
          blindsQty: 0,
          noExtras: true,
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an extras quantity above the maximum", () => {
    const result = validateSubmission(
      validInput({
        extras: {
          kitchenCabinets: false,
          refrigerator: false,
          oven: false,
          interiorWindowsQty: 999,
          blindsQty: 0,
          noExtras: false,
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed service date", () => {
    const result = validateSubmission(validInput({ serviceDate: "not-a-date" }));
    expect(result.ok).toBe(false);
  });

  // The standing 24-hour minimum-lead-time rule is no longer enforced
  // here — validateSubmission.ts only checks date/time format now. It is
  // enforced authoritatively in availability.ts's checkExactTimeAvailability/
  // getAvailableStartTimes (see availability.test.ts), which is what
  // bookingService.ts actually calls before ever appending a booking.
  // A date close to "now" (e.g. futureDateKey(1)) is therefore no longer
  // rejected by this function by itself.

  it("rejects an out-of-catalog appointment start time", () => {
    const result = validateSubmission(validInput({ serviceStartTime: "midnight" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a half-hour start time not on the approved hourly catalog", () => {
    const result = validateSubmission(validInput({ serviceStartTime: "09:30" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a start time before operating hours", () => {
    const result = validateSubmission(validInput({ serviceStartTime: "07:00" }));
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid someoneHome value", () => {
    const result = validateSubmission(validInput({ someoneHome: "maybe" }));
    expect(result.ok).toBe(false);
  });

  it("rejects when the policy is not accepted", () => {
    const result = validateSubmission(validInput({ agreedToPolicy: false }));
    expect(result.ok).toBe(false);
  });

  it('rejects propertyType "other" without a description', () => {
    const result = validateSubmission(validInput({ propertyType: "other", propertyTypeOther: "" }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unrecognized propertyType", () => {
    const result = validateSubmission(validInput({ propertyType: "castle" }));
    expect(result.ok).toBe(false);
  });

  it("truncates special instructions to the max length rather than rejecting", () => {
    const result = validateSubmission(validInput({ specialInstructions: "x".repeat(600) }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.specialInstructions.length).toBe(500);
    }
  });
});

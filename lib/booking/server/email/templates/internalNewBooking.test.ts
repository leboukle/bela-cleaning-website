import { describe, it, expect } from "vitest";
import { buildInternalNewBookingEmail } from "./internalNewBooking";
import { sampleBookingRecord } from "../../testFixtures";

describe("buildInternalNewBookingEmail", () => {
  it('builds the subject as "New BeLa Booking — [BOOKING ID] — [SERVICE DATE]"', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF", serviceDate: "2026-02-15" });
    const email = buildInternalNewBookingEmail(record);
    expect(email.subject).toBe("New BeLa Booking — BELA-20260101-ABCDEF — 2026-02-15");
  });

  it("includes the complete operational booking record", () => {
    const record = sampleBookingRecord();
    const email = buildInternalNewBookingEmail(record);
    for (const field of [
      record.bookingId,
      record.submittedAt,
      record.email,
      record.mobile,
      record.propertyType,
      record.squareFootage,
      record.bedrooms,
      record.bathrooms,
      record.cleaningType,
      record.frequency,
      record.serviceDate,
      record.arrivalWindow,
      record.someoneHome,
      record.specialInstructions,
      record.bookingStatus,
      record.paymentStatus,
    ]) {
      expect(email.text).toContain(field);
    }
  });

  it("includes extras with quantities in human-readable form", () => {
    const record = sampleBookingRecord({ extras: "kitchenCabinets;interiorWindows:2" });
    const email = buildInternalNewBookingEmail(record);
    expect(email.text).toContain("Inside kitchen cabinets, Interior windows × 2");
  });

  it('shows "None" for extras and special instructions rather than omitting the rows', () => {
    const record = sampleBookingRecord({ extras: "none", specialInstructions: "" });
    const email = buildInternalNewBookingEmail(record);
    expect(email.text).toContain("Extras: None");
    expect(email.text).toContain("Special instructions: None");
  });

  it("does not expose Google Sheets, spreadsheet IDs, or infrastructure details", () => {
    const record = sampleBookingRecord();
    const email = buildInternalNewBookingEmail(record);
    const combined = `${email.text}\n${email.html}`.toLowerCase();
    expect(combined).not.toContain("spreadsheet");
    expect(combined).not.toContain("vercel");
  });
});

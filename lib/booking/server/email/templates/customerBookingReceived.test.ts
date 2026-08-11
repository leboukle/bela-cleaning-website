import { describe, it, expect } from "vitest";
import { buildCustomerBookingReceivedEmail } from "./customerBookingReceived";
import { sampleBookingRecord } from "../../testFixtures";

describe("buildCustomerBookingReceivedEmail", () => {
  it('builds the subject as "BeLa Cleaning — Booking [BOOKING ID]"', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF" });
    const email = buildCustomerBookingReceivedEmail(record);
    expect(email.subject).toBe("BeLa Cleaning — Booking BELA-20260101-ABCDEF");
  });

  it("includes the core booking details in both text and html bodies", () => {
    const record = sampleBookingRecord();
    const email = buildCustomerBookingReceivedEmail(record);
    for (const body of [email.text, email.html]) {
      expect(body).toContain(record.bookingId);
      expect(body).toContain(record.cleaningType);
      expect(body).toContain(record.arrivalWindow);
      expect(body).toContain("Hoboken");
    }
  });

  it("includes frequency when recurring", () => {
    const record = sampleBookingRecord({ frequency: "Weekly" });
    const email = buildCustomerBookingReceivedEmail(record);
    expect(email.text).toContain("Frequency: Weekly");
  });

  it("omits frequency when one-time", () => {
    const record = sampleBookingRecord({ frequency: "One time" });
    const email = buildCustomerBookingReceivedEmail(record);
    expect(email.text).not.toContain("Frequency:");
  });

  it("includes extras when present, described in human-readable form", () => {
    const record = sampleBookingRecord({ extras: "kitchenCabinets;interiorWindows:2" });
    const email = buildCustomerBookingReceivedEmail(record);
    expect(email.text).toContain("Extras: Inside kitchen cabinets, Interior windows × 2");
  });

  it('omits the extras line entirely when there are none ("none")', () => {
    const record = sampleBookingRecord({ extras: "none" });
    const email = buildCustomerBookingReceivedEmail(record);
    expect(email.text).not.toContain("Extras:");
  });

  it("never claims the booking is confirmed or that payment was already charged", () => {
    const record = sampleBookingRecord();
    const email = buildCustomerBookingReceivedEmail(record);
    const lowerText = email.text.toLowerCase();
    expect(lowerText).not.toContain("your appointment is confirmed");
    expect(lowerText).not.toContain("payment has been collected");
    expect(lowerText).not.toContain("card has been charged");
    expect(email.text).toContain("you have not been charged");
  });

  it("does not expose Google Sheets, spreadsheet IDs, or infrastructure details", () => {
    const record = sampleBookingRecord();
    const email = buildCustomerBookingReceivedEmail(record);
    const combined = `${email.text}\n${email.html}`.toLowerCase();
    expect(combined).not.toContain("sheet");
    expect(combined).not.toContain("spreadsheet");
    expect(combined).not.toContain("vercel");
    expect(combined).not.toContain("google");
  });

  it("HTML-escapes customer-controlled values in the html body", () => {
    const record = sampleBookingRecord({ firstName: '<script>alert("x")</script>' });
    const email = buildCustomerBookingReceivedEmail(record);
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

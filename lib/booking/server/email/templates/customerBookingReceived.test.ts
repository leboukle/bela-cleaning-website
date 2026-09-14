import { describe, it, expect } from "vitest";
import { buildCustomerBookingReceivedEmail } from "./customerBookingReceived";
import { sampleBookingRecord } from "../../testFixtures";

const MANAGE_TOKEN = "test-manage-token-abc123";

describe("buildCustomerBookingReceivedEmail", () => {
  it('builds the subject as "BeLa Cleaning — Booking [BOOKING ID]"', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF" });
    const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
    expect(email.subject).toBe("BeLa Cleaning — Booking BELA-20260101-ABCDEF");
  });

  it("includes the core booking details in both text and html bodies", () => {
    const record = sampleBookingRecord();
    const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
    for (const body of [email.text, email.html]) {
      expect(body).toContain(record.bookingId);
      expect(body).toContain(record.cleaningType);
      expect(body).toContain(record.arrivalWindow);
      expect(body).toContain("Hoboken");
    }
  });

  it("includes frequency when recurring", () => {
    const record = sampleBookingRecord({ frequency: "Weekly" });
    const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
    expect(email.text).toContain("Frequency: Weekly");
  });

  it("omits frequency when one-time", () => {
    const record = sampleBookingRecord({ frequency: "One time" });
    const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
    expect(email.text).not.toContain("Frequency:");
  });

  it("includes extras when present, described in human-readable form", () => {
    const record = sampleBookingRecord({ extras: "kitchenCabinets;interiorWindows:2" });
    const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
    expect(email.text).toContain("Extras: Inside kitchen cabinets, Interior windows × 2");
  });

  it('omits the extras line entirely when there are none ("none")', () => {
    const record = sampleBookingRecord({ extras: "none" });
    const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
    expect(email.text).not.toContain("Extras:");
  });

  it("never claims the booking is confirmed or that payment was already charged", () => {
    const record = sampleBookingRecord();
    const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
    const lowerText = email.text.toLowerCase();
    expect(lowerText).not.toContain("your appointment is confirmed");
    expect(lowerText).not.toContain("payment has been collected");
    expect(lowerText).not.toContain("card has been charged");
    expect(email.text).toContain("you have not been charged");
  });

  it("includes the Manage Booking link built from the raw token, in both bodies", () => {
    const record = sampleBookingRecord();
    const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
    expect(email.text).toContain(`/manage-booking/${MANAGE_TOKEN}`);
    expect(email.html).toContain(`/manage-booking/${MANAGE_TOKEN}`);
    expect(email.html).toContain("Manage Booking");
  });

  it("states the precise 24-hour / 50% late-cancellation policy, not vague language", () => {
    const record = sampleBookingRecord();
    const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
    expect(email.text).toContain("50% of the booking total");
    expect(email.text.toLowerCase()).not.toContain("fees may apply");
  });

  it("does not expose Google Sheets, spreadsheet IDs, or infrastructure details", () => {
    const record = sampleBookingRecord();
    const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
    const combined = `${email.text}\n${email.html}`.toLowerCase();
    expect(combined).not.toContain("sheet");
    expect(combined).not.toContain("spreadsheet");
    expect(combined).not.toContain("vercel");
    expect(combined).not.toContain("google");
  });

  it("HTML-escapes customer-controlled values in the html body", () => {
    const record = sampleBookingRecord({ firstName: '<script>alert("x")</script>' });
    const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("&lt;script&gt;");
  });

  describe("service scope (includes/excludes/add-ons)", () => {
    it("includes the service's includes and excludes, sourced from the centralized service definition", () => {
      const record = sampleBookingRecord({ cleaningType: "Standard cleaning", extras: "none" });
      const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
      expect(email.text).toContain("Your Standard Cleaning includes:");
      expect(email.text).toContain("- Kitchen surfaces and countertops");
      expect(email.text).toContain("Your service does not include:");
      expect(email.text).toContain("- Interior windows");
      expect(email.html).toContain("Your Standard Cleaning includes");
      expect(email.html).toContain("Kitchen surfaces and countertops");
    });

    it("never tells the customer an add-on they purchased is not included", () => {
      // Regression guard for the exact scenario this feature exists to
      // prevent: buying "Interior windows" must not leave "Interior
      // windows" sitting in the "does not include" list.
      const record = sampleBookingRecord({ cleaningType: "Standard cleaning", extras: "interiorWindows:2" });
      const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
      expect(email.text).not.toContain("- Interior windows");
      expect(email.text).toContain("Your selected add-ons:");
      expect(email.text).toContain("- Interior Windows");
    });

    it("removes only the specific exclusion for the add-on purchased, leaving its sibling exclusion in place", () => {
      // Oven and refrigerator are independent exclusions — buying only
      // the oven add-on must not silently imply refrigerator cleaning is
      // included too.
      const record = sampleBookingRecord({ cleaningType: "Standard cleaning", extras: "oven" });
      const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
      expect(email.text).not.toContain("Inside oven unless selected as an add-on");
      expect(email.text).toContain("Inside refrigerator unless selected as an add-on");
    });

    it("omits the selected add-ons section when there are none", () => {
      const record = sampleBookingRecord({ cleaningType: "Standard cleaning", extras: "none" });
      const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
      expect(email.text).not.toContain("Your selected add-ons:");
    });

    it("uses the Move-In-specific name and shared move-in/out scope for a Move-in cleaning booking", () => {
      const record = sampleBookingRecord({ cleaningType: "Move-in cleaning", extras: "none" });
      const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
      expect(email.text).toContain("Your Move-In Cleaning includes:");
      expect(email.text).toContain("- Inside empty cabinets and drawers");
    });

    it("omits the scope section entirely rather than crashing when the cleaning type label is unrecognized", () => {
      const record = sampleBookingRecord({ cleaningType: "Some legacy label", extras: "none" });
      const email = buildCustomerBookingReceivedEmail(record, MANAGE_TOKEN);
      expect(email.text).not.toContain("includes:");
      expect(email.text).not.toContain("does not include");
    });
  });
});

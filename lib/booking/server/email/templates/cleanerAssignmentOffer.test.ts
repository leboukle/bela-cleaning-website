import { describe, it, expect } from "vitest";
import { buildCleanerAssignmentOfferEmail } from "./cleanerAssignmentOffer";
import { sampleBookingRecord } from "../../testFixtures";
import type { CleanerRecord } from "../../cleanerTypes";

function fakeCleaner(overrides: Partial<CleanerRecord> = {}): CleanerRecord {
  return {
    cleanerId: "CLNR-AAAAAA",
    firstName: "Susie",
    lastName: "Smith",
    email: "susie@example.com",
    phone: "5551234567",
    status: "Active",
    createdAt: "",
    ...overrides,
  };
}

const OFFER = { assignmentId: "ASGN-1", payoutAmount: 114.3, payoutPercentage: 0.6, token: "test-token-abc123" };

describe("buildCleanerAssignmentOfferEmail", () => {
  it('greets the cleaner by first name and includes "New" framing', () => {
    const email = buildCleanerAssignmentOfferEmail(sampleBookingRecord(), fakeCleaner({ firstName: "Susie" }), OFFER);
    expect(email.text).toContain("Hi Susie,");
    expect(email.subject).toContain("New Assignment Available");
  });

  it("includes Booking ID, customer FIRST NAME ONLY, address, date, time, duration, cleaning type, and home-size details", () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF", firstName: "Jane", lastName: "Doe", bedrooms: "2 bedrooms", bathrooms: "2 bathrooms" });
    const email = buildCleanerAssignmentOfferEmail(record, fakeCleaner(), OFFER);
    for (const body of [email.text, email.html]) {
      expect(body).toContain("BELA-20260101-ABCDEF");
      expect(body).toContain("Jane");
      expect(body).toContain("Hoboken");
      expect(body).toContain("2 bedrooms");
      expect(body).toContain("2 bathrooms");
    }
  });

  it("includes cleaning total and cleaner payout percentage/amount", () => {
    const record = sampleBookingRecord({ chargeAmount: 190.5 });
    const email = buildCleanerAssignmentOfferEmail(record, fakeCleaner(), OFFER);
    expect(email.text).toContain("$190.50");
    expect(email.text).toContain("60%");
    expect(email.text).toContain("$114.30");
  });

  it("includes selected add-ons when present", () => {
    const record = sampleBookingRecord({ extras: "kitchenCabinets;interiorWindows:2" });
    const email = buildCleanerAssignmentOfferEmail(record, fakeCleaner(), OFFER);
    expect(email.text).toContain("Inside kitchen cabinets, Interior windows × 2");
  });

  it("includes access and special-instructions job notes when present", () => {
    const record = sampleBookingRecord({ someoneHome: "Yes, someone will be home", specialInstructions: "Dog in the yard, gate code 1234" });
    const email = buildCleanerAssignmentOfferEmail(record, fakeCleaner(), OFFER);
    expect(email.text).toContain("Yes, someone will be home");
    expect(email.text).toContain("Dog in the yard, gate code 1234");
  });

  it("NEVER exposes customer email, phone, or any Stripe/payment identifier", () => {
    const record = sampleBookingRecord({
      email: "customer-should-never-appear@example.com",
      mobile: "5559998888",
      stripeCustomerId: "cus_should_never_appear",
      stripePaymentMethodId: "pm_should_never_appear",
      stripeSetupIntentId: "seti_should_never_appear",
      stripePaymentIntentId: "pi_should_never_appear",
    });
    const email = buildCleanerAssignmentOfferEmail(record, fakeCleaner(), OFFER);
    const combined = `${email.text}\n${email.html}`;
    expect(combined).not.toContain("customer-should-never-appear@example.com");
    expect(combined).not.toContain("5559998888");
    expect(combined).not.toContain("cus_should_never_appear");
    expect(combined).not.toContain("pm_should_never_appear");
    expect(combined).not.toContain("seti_should_never_appear");
    expect(combined).not.toContain("pi_should_never_appear");
  });

  it("never mentions tips", () => {
    const email = buildCleanerAssignmentOfferEmail(sampleBookingRecord(), fakeCleaner(), OFFER);
    expect(email.text.toLowerCase()).not.toContain("tip");
  });

  it("links both ACCEPT and DECLINE controls to the same safe assignment page (never a directly-mutating link)", () => {
    const email = buildCleanerAssignmentOfferEmail(sampleBookingRecord(), fakeCleaner(), OFFER);
    expect(email.html).toContain("ACCEPT ASSIGNMENT");
    expect(email.html).toContain("DECLINE ASSIGNMENT");
    expect(email.text).toContain(`/cleaner-assignment/${OFFER.token}`);
    // Both buttons resolve to the exact same URL — the actual decision
    // happens via a real button/POST on that page, not on either link itself.
    const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(hrefs).size).toBe(1);
  });

  it("HTML-escapes customer-controlled values", () => {
    const record = sampleBookingRecord({ firstName: '<script>alert("x")</script>' });
    const email = buildCleanerAssignmentOfferEmail(record, fakeCleaner(), OFFER);
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("includes the standing 'contact BeLa directly if availability changes' notice, with the centralized contact info", () => {
    const email = buildCleanerAssignmentOfferEmail(sampleBookingRecord(), fakeCleaner(), OFFER);
    expect(email.text.toLowerCase()).toContain("contact bela cleaning directly");
    expect(email.text).toContain("info@belacleaning.com");
  });
});

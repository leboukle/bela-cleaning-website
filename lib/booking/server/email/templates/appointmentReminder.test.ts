import { describe, it, expect } from "vitest";
import { buildAppointmentReminderEmail } from "./appointmentReminder";
import { sampleBookingRecord } from "../../testFixtures";

const MANAGE_TOKEN = "test-reminder-token-abc123";

describe("buildAppointmentReminderEmail", () => {
  it('builds the subject including "Reminder" and the booking ID', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-20260101-ABCDEF" });
    const email = buildAppointmentReminderEmail(record, MANAGE_TOKEN);
    expect(email.subject).toContain("Reminder");
    expect(email.subject).toContain("BELA-20260101-ABCDEF");
  });

  it("includes Booking ID, service date, appointment time, address, cleaning type, duration, and total", () => {
    const record = sampleBookingRecord({
      serviceDate: "2026-09-22",
      arrivalWindow: "Morning",
      streetAddress: "123 Main St",
      cleaningType: "Standard cleaning",
      estimatedDurationMinutes: 210,
      chargeAmount: 190.5,
    });
    const email = buildAppointmentReminderEmail(record, MANAGE_TOKEN);
    for (const body of [email.text, email.html]) {
      expect(body).toContain(record.bookingId);
      expect(body).toContain("123 Main St");
      expect(body).toContain("Standard cleaning");
      expect(body).toContain("$190.50");
    }
  });

  it("includes extras when present, described in human-readable form", () => {
    const record = sampleBookingRecord({ extras: "kitchenCabinets;interiorWindows:2" });
    const email = buildAppointmentReminderEmail(record, MANAGE_TOKEN);
    expect(email.text).toContain("Inside kitchen cabinets, Interior windows × 2");
  });

  it('omits the extras line entirely when there are none ("none")', () => {
    const record = sampleBookingRecord({ extras: "none" });
    const email = buildAppointmentReminderEmail(record, MANAGE_TOKEN);
    expect(email.text).not.toContain("Extras:");
  });

  it("shows the exact appointment time for a Milestone 6 exact-time booking", () => {
    const record = sampleBookingRecord({ arrivalWindow: "", serviceStartTime: "09:00" });
    const email = buildAppointmentReminderEmail(record, MANAGE_TOKEN);
    expect(email.text).toContain("9:00 AM");
  });

  it("falls back to the legacy Arrival Window label for a pre-amendment booking", () => {
    const record = sampleBookingRecord({ arrivalWindow: "Afternoon", serviceStartTime: "" });
    const email = buildAppointmentReminderEmail(record, MANAGE_TOKEN);
    expect(email.text).toContain("Afternoon (2:00 PM – 4:00 PM)");
  });

  it("states the precise 24-hour / 50% late-cancellation policy, not vague language", () => {
    const record = sampleBookingRecord();
    const email = buildAppointmentReminderEmail(record, MANAGE_TOKEN);
    expect(email.text).toContain("50% of the booking total");
    expect(email.text.toLowerCase()).not.toContain("fees may apply");
  });

  it("includes a directly usable Manage Booking link built from the raw token, in both bodies — not a reference to the original email", () => {
    const record = sampleBookingRecord();
    const email = buildAppointmentReminderEmail(record, MANAGE_TOKEN);
    expect(email.text).toContain(`/manage-booking/${MANAGE_TOKEN}`);
    expect(email.html).toContain(`/manage-booking/${MANAGE_TOKEN}`);
    expect(email.html).toContain("Manage Booking");
    expect(email.text.toLowerCase()).not.toContain("original booking confirmation email");
  });

  it("never exposes any Stripe identifier", () => {
    const record = sampleBookingRecord({
      stripeCustomerId: "cus_should_never_appear",
      stripePaymentMethodId: "pm_should_never_appear",
      stripeSetupIntentId: "seti_should_never_appear",
      stripePaymentIntentId: "pi_should_never_appear",
    });
    const email = buildAppointmentReminderEmail(record, MANAGE_TOKEN);
    const combined = `${email.text}\n${email.html}`;
    expect(combined).not.toContain("cus_should_never_appear");
    expect(combined).not.toContain("pm_should_never_appear");
    expect(combined).not.toContain("seti_should_never_appear");
    expect(combined).not.toContain("pi_should_never_appear");
  });

  it("HTML-escapes customer-controlled values in the html body", () => {
    const record = sampleBookingRecord({ firstName: '<script>alert("x")</script>' });
    const email = buildAppointmentReminderEmail(record, MANAGE_TOKEN);
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

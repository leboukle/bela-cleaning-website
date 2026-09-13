import { describe, it, expect } from "vitest";
import { buildInternalCancellationEmail } from "./internalCancellationNotification";
import { sampleBookingRecord } from "../../testFixtures";

describe("buildInternalCancellationEmail", () => {
  it('labels a free cancellation as "Booking cancelled (no charge)" in the subject, with no fee row', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-1" });
    const email = buildInternalCancellationEmail(record, { isLate: false });
    expect(email.subject).toBe("Booking cancelled (no charge) — BELA-1");
    expect(email.text).not.toContain("Late-cancellation fee");
  });

  it('labels a late cancellation as "Late cancellation (fee applies)" and includes the fee amount and payment status', () => {
    const record = sampleBookingRecord({ bookingId: "BELA-2", cancellationFeeAmount: 75, paymentStatus: "Cancellation Fee Processing" });
    const email = buildInternalCancellationEmail(record, { isLate: true });
    expect(email.subject).toBe("Late cancellation (fee applies) — BELA-2");
    expect(email.text).toContain("$75");
    expect(email.text).toContain("Cancellation Fee Processing");
  });

  it("includes the customer name and original service date for staff context", () => {
    const record = sampleBookingRecord({ firstName: "Jane", lastName: "Doe", serviceDate: "2026-09-22" });
    const email = buildInternalCancellationEmail(record, { isLate: false });
    expect(email.text).toContain("Jane Doe");
    expect(email.text).toContain("2026-09-22");
  });

  it("HTML-escapes customer-controlled values in the html body", () => {
    const record = sampleBookingRecord({ firstName: '<script>alert("x")</script>' });
    const email = buildInternalCancellationEmail(record, { isLate: false });
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

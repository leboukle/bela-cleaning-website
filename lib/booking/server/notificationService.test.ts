import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NotificationService } from "./notificationService";
import { sampleBookingRecord } from "./testFixtures";
import type { EmailMessage, EmailSendResult, EmailTransport } from "./email/emailTransport";

class FakeEmailTransport implements EmailTransport {
  sent: EmailMessage[] = [];
  result: EmailSendResult = { ok: true };

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(message);
    return this.result;
  }
}

const originalInternalEmail = process.env.BELA_INTERNAL_NOTIFICATION_EMAIL;

beforeEach(() => {
  delete process.env.BELA_INTERNAL_NOTIFICATION_EMAIL;
});

afterEach(() => {
  if (originalInternalEmail === undefined) delete process.env.BELA_INTERNAL_NOTIFICATION_EMAIL;
  else process.env.BELA_INTERNAL_NOTIFICATION_EMAIL = originalInternalEmail;
});

describe("NotificationService.sendCustomerBookingReceived", () => {
  it("sends to the booking's own email address with the correct subject", async () => {
    const transport = new FakeEmailTransport();
    const service = new NotificationService(transport);
    const record = sampleBookingRecord({ email: "customer@example.com", bookingId: "BELA-20260101-ABCDEF" });

    const result = await service.sendCustomerBookingReceived(record);

    expect(result.ok).toBe(true);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].to).toBe("customer@example.com");
    expect(transport.sent[0].subject).toBe("BeLa Cleaning — Booking BELA-20260101-ABCDEF");
  });

  it("propagates a transport failure without throwing", async () => {
    const transport = new FakeEmailTransport();
    transport.result = { ok: false, error: "Gmail API request failed with status 500." };
    const service = new NotificationService(transport);

    const result = await service.sendCustomerBookingReceived(sampleBookingRecord());
    expect(result.ok).toBe(false);
  });
});

describe("NotificationService.sendInternalNewBookingNotification", () => {
  it("sends to BELA_INTERNAL_NOTIFICATION_EMAIL, never to the customer's address", async () => {
    process.env.BELA_INTERNAL_NOTIFICATION_EMAIL = "ops@belacleaning.com";
    const transport = new FakeEmailTransport();
    const service = new NotificationService(transport);
    const record = sampleBookingRecord({ email: "customer-controlled@attacker.example" });

    const result = await service.sendInternalNewBookingNotification(record);

    expect(result.ok).toBe(true);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].to).toBe("ops@belacleaning.com");
    expect(transport.sent[0].to).not.toBe(record.email);
  });

  it("fails closed (without ever calling the transport) when the internal recipient is not configured", async () => {
    const transport = new FakeEmailTransport();
    const service = new NotificationService(transport);

    const result = await service.sendInternalNewBookingNotification(sampleBookingRecord());

    expect(result.ok).toBe(false);
    expect(transport.sent).toHaveLength(0);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./stripe/stripeConfig", () => ({ getPaymentSchedulerSecret: vi.fn() }));

import { getPaymentSchedulerSecret } from "./stripe/stripeConfig";
import { verifySchedulerRequest, SchedulerAuthError } from "./schedulerAuth";

const mockedGetSecret = vi.mocked(getPaymentSchedulerSecret);

beforeEach(() => {
  mockedGetSecret.mockReset().mockReturnValue("correct-secret-value");
});

describe("verifySchedulerRequest", () => {
  it("passes when the header exactly matches the configured secret", () => {
    const headers = new Headers({ "x-payment-scheduler-secret": "correct-secret-value" });
    expect(() => verifySchedulerRequest(headers)).not.toThrow();
  });

  it("throws SchedulerAuthError when the header is missing entirely", () => {
    const headers = new Headers();
    expect(() => verifySchedulerRequest(headers)).toThrow(SchedulerAuthError);
  });

  it("throws SchedulerAuthError when the header value doesn't match", () => {
    const headers = new Headers({ "x-payment-scheduler-secret": "wrong-value" });
    expect(() => verifySchedulerRequest(headers)).toThrow(SchedulerAuthError);
  });

  it("throws SchedulerAuthError for a same-length but different value (not just a length check)", () => {
    const headers = new Headers({ "x-payment-scheduler-secret": "correct-secret-valuz" });
    expect(() => verifySchedulerRequest(headers)).toThrow(SchedulerAuthError);
  });
});

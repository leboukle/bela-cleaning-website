import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/booking/server/stripe/setupIntent", () => ({ createBookingSetupIntent: vi.fn() }));
vi.mock("@/lib/booking/server/availability", () => ({ checkDateAvailability: vi.fn() }));
vi.mock("@/lib/booking/server/rateLimit", () => ({ isRateLimited: vi.fn(() => false) }));

import { createBookingSetupIntent } from "@/lib/booking/server/stripe/setupIntent";
import { checkDateAvailability } from "@/lib/booking/server/availability";
import { POST } from "./route";

const mockedCreate = vi.mocked(createBookingSetupIntent);
const mockedCheck = vi.mocked(checkDateAvailability);

const CUSTOMER = { firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "5551234567" };

function post(body: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/payments/setup-intent", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  mockedCreate.mockReset().mockResolvedValue({ clientSecret: "seti_secret", setupIntentId: "seti_1" } as never);
  mockedCheck.mockReset();
});

describe("POST /api/payments/setup-intent — card collection for an unavailable appointment", () => {
  it("refuses a closed date with the closure message and never creates a SetupIntent", async () => {
    mockedCheck.mockResolvedValue({ available: false, reason: "closed", maxCapacity: 2, currentCount: 0 });
    const res = await post({ ...CUSTOMER, serviceDate: "2026-11-15" });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body).toMatchObject({
      ok: false,
      code: "date-unavailable",
      message: "This date is unavailable. Please choose another date.",
    });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("refuses any other unavailable date too", async () => {
    mockedCheck.mockResolvedValue({ available: false, reason: "blackout", maxCapacity: 2, currentCount: 0 });
    const res = await post({ ...CUSTOMER, serviceDate: "2027-02-10" });
    expect(res.status).toBe(409);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("rejects a malformed date", async () => {
    const res = await post({ ...CUSTOMER, serviceDate: "11/15/2026" });
    expect(res.status).toBe(422);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("creates the SetupIntent for an available date", async () => {
    mockedCheck.mockResolvedValue({ available: true, reason: null, maxCapacity: 2, currentCount: 0 });
    const res = await post({ ...CUSTOMER, serviceDate: "2027-01-12" });
    expect(res.status).toBe(201);
    expect(mockedCreate).toHaveBeenCalledTimes(1);
  });

  it("still serves a browser tab that sends no date (final submission re-checks everything)", async () => {
    const res = await post(CUSTOMER);
    expect(res.status).toBe(201);
    expect(mockedCheck).not.toHaveBeenCalled();
  });
});

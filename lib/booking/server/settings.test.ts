import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./sheetsClient", () => ({
  getRange: vi.fn(),
}));

import { getRange } from "./sheetsClient";
import { getBookingSettings, resetSettingsCacheForTests, SettingsError } from "./settings";

const mockedGetRange = vi.mocked(getRange);

beforeEach(() => {
  resetSettingsCacheForTests();
  mockedGetRange.mockReset();
});

const VALID_ROWS = [
  ["minimum_lead_days", "7"],
  ["default_daily_capacity", "2"],
  ["timezone", "America/New_York"],
  ["schema_version", "1"],
];

describe("getBookingSettings", () => {
  it("parses valid settings", async () => {
    mockedGetRange.mockResolvedValue(VALID_ROWS);
    const settings = await getBookingSettings();
    expect(settings).toEqual({
      minimumLeadDays: 7,
      defaultDailyCapacity: 2,
      timezone: "America/New_York",
      schemaVersion: 1,
    });
  });

  it("throws when minimum_lead_days is missing", async () => {
    mockedGetRange.mockResolvedValue(VALID_ROWS.filter((r) => r[0] !== "minimum_lead_days"));
    await expect(getBookingSettings()).rejects.toThrow(SettingsError);
  });

  it("throws when a numeric value is malformed", async () => {
    mockedGetRange.mockResolvedValue(VALID_ROWS.map((r) => (r[0] === "default_daily_capacity" ? [r[0], "two"] : r)));
    await expect(getBookingSettings()).rejects.toThrow(SettingsError);
  });

  it("throws when schema_version is less than 1", async () => {
    mockedGetRange.mockResolvedValue(VALID_ROWS.map((r) => (r[0] === "schema_version" ? [r[0], "0"] : r)));
    await expect(getBookingSettings()).rejects.toThrow(SettingsError);
  });

  it("throws on an invalid or missing timezone", async () => {
    mockedGetRange.mockResolvedValue(VALID_ROWS.map((r) => (r[0] === "timezone" ? [r[0], "Not/AZone"] : r)));
    await expect(getBookingSettings()).rejects.toThrow(SettingsError);
  });

  it("caches the result across calls until skipCache is passed", async () => {
    mockedGetRange.mockResolvedValue(VALID_ROWS);
    await getBookingSettings();
    await getBookingSettings();
    expect(mockedGetRange).toHaveBeenCalledTimes(1);
    await getBookingSettings({ skipCache: true });
    expect(mockedGetRange).toHaveBeenCalledTimes(2);
  });
});

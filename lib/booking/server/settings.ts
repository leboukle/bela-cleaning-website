// SERVER-ONLY. Reads and validates the "Settings" worksheet: minimum lead
// time, default daily capacity, booking timezone, and schema version.
//
// Fails CLOSED, not open: if the sheet can't be read, or any of these four
// values is missing/malformed, every function here throws rather than
// substituting a guessed default. These values directly gate money and
// availability correctness (a wrong lead time or capacity could let an
// invalid booking through), so "safe" here means "reject the request",
// not "silently continue with a best guess."
import "server-only";
import { getRange } from "./sheetsClient";

export type BookingSettings = {
  minimumLeadDays: number;
  defaultDailyCapacity: number;
  timezone: string;
  schemaVersion: number;
};

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

// Only the Setting/Value columns are needed — Description (column C) and
// the header row are intentionally excluded from the read.
const SETTINGS_RANGE = "Settings!A2:B";

const CACHE_TTL_MS = 60_000;
let cache: { value: BookingSettings; expiresAt: number } | null = null;

function isValidTimezone(timezone: string): boolean {
  try {
    // Throws a RangeError for an unrecognized IANA zone name.
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function parseNonNegativeInt(raw: string | undefined, key: string): number {
  if (raw === undefined || raw.length === 0) {
    throw new SettingsError(`Missing Settings value: "${key}".`);
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new SettingsError(`Malformed Settings value for "${key}": "${raw}".`);
  }
  return parsed;
}

/**
 * Reads the current booking settings, using a short in-memory cache
 * (per warm serverless instance) to avoid re-reading the sheet on every
 * request. Pass `skipCache: true` to force a fresh read.
 */
export async function getBookingSettings(options: { skipCache?: boolean } = {}): Promise<BookingSettings> {
  if (!options.skipCache && cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  const rows = await getRange(SETTINGS_RANGE);
  const values = new Map<string, string>();
  for (const row of rows) {
    const [key, value] = row;
    if (key) values.set(key.trim(), (value ?? "").trim());
  }

  const minimumLeadDays = parseNonNegativeInt(values.get("minimum_lead_days"), "minimum_lead_days");
  const defaultDailyCapacity = parseNonNegativeInt(values.get("default_daily_capacity"), "default_daily_capacity");
  const schemaVersion = parseNonNegativeInt(values.get("schema_version"), "schema_version");
  if (schemaVersion < 1) {
    throw new SettingsError(`Malformed Settings value for "schema_version": must be at least 1.`);
  }

  const timezone = values.get("timezone");
  if (!timezone || !isValidTimezone(timezone)) {
    throw new SettingsError(`Malformed or missing Settings value for "timezone": "${timezone ?? ""}".`);
  }

  const settings: BookingSettings = { minimumLeadDays, defaultDailyCapacity, timezone, schemaVersion };
  cache = { value: settings, expiresAt: Date.now() + CACHE_TTL_MS };
  return settings;
}

/** Test-only: clears the in-memory cache between test cases. */
export function resetSettingsCacheForTests(): void {
  cache = null;
}

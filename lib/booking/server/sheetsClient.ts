// SERVER-ONLY. Thin wrapper around the Google Sheets API v4 REST endpoints.
// Deliberately avoids the full `googleapis` SDK — this booking backend only
// ever needs `values.get`, `values.batchGet`, and `values.append`, so a
// direct authenticated `fetch` keeps the dependency footprint minimal.
//
// Every write in this module uses `valueInputOption=RAW`, which per the
// Sheets API is documented to store submitted values exactly as given
// without parsing them as formulas — this is the primary defense against
// spreadsheet formula injection (see sanitize.ts for the secondary,
// belt-and-suspenders layer applied to customer free-text before it
// reaches this module).
import "server-only";
import { getGoogleAccessToken, getSpreadsheetId } from "./googleAuth";

export class SheetsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SheetsApiError";
    this.status = status;
  }
}

type SheetValue = string | number | boolean;

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsFetch(path: string, init?: RequestInit): Promise<unknown> {
  const token = await getGoogleAccessToken();
  const spreadsheetId = getSpreadsheetId();
  const res = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    // Bounds how long a single Sheets call can hang so a booking request
    // fails fast rather than tying up the function indefinitely.
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // Sanitized log: status + which range/endpoint was involved, never the
    // response body (which could echo request details) and never the
    // access token. See docs/booking-backend.md's security section.
    console.error(`[sheetsClient] Google Sheets API error: status=${res.status} path=${path.split("?")[0]}`);
    throw new SheetsApiError("Google Sheets API request failed.", res.status);
  }

  return res.json();
}

/** Reads a single A1-notation range. Returns `[]` if the range is empty. */
export async function getRange(range: string): Promise<string[][]> {
  const data = (await sheetsFetch(`/values/${encodeURIComponent(range)}`)) as { values?: string[][] };
  return data.values ?? [];
}

/**
 * Reads multiple A1-notation ranges in a single HTTP round trip — used by
 * the capacity check, which needs both the Service Date and Booking Status
 * columns without pulling the whole Bookings sheet.
 */
export async function batchGetRanges(ranges: string[]): Promise<string[][][]> {
  const query = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const data = (await sheetsFetch(`/values:batchGet?${query}`)) as {
    valueRanges?: Array<{ values?: string[][] }>;
  };
  return (data.valueRanges ?? []).map((vr) => vr.values ?? []);
}

/** Appends exactly one row to the given A1-notation range/sheet. */
export async function appendRow(range: string, row: SheetValue[]): Promise<void> {
  await sheetsFetch(
    `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values: [row] }),
    },
  );
}

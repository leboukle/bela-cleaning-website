// SERVER-ONLY. Secondary defense against spreadsheet formula injection
// (STEP 14).
//
// PRIMARY defense: every write in sheetsClient.ts uses
// `valueInputOption=RAW`, which the Sheets API documents as storing
// submitted values exactly as given, without parsing them as formulas —
// so a value like "=1+1" is stored and displayed as that literal text,
// never evaluated.
//
// This function is the belt-and-suspenders SECOND layer: if any
// customer-controlled text begins with a character that traditionally
// triggers formula evaluation (=, +, -, @), it gets a leading apostrophe
// prefix — the long-standing spreadsheet convention for "force text" —
// so the row stays safe even if a future code change ever switches a
// write path to USER_ENTERED. Legitimate text that doesn't start with one
// of these characters is returned completely unchanged.
import "server-only";

const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@"]);

export function sanitizeForSheets(value: string): string {
  if (value.length === 0) return value;
  return FORMULA_TRIGGER_CHARS.has(value[0]) ? `'${value}` : value;
}

// SERVER-ONLY. Deterministic, documented serialization of ExtrasState for
// the Bookings sheet's "Extras" column (STEP 13).
//
// FORMAT: semicolon-separated tokens in a FIXED canonical order (always
// kitchenCabinets, refrigerator, oven, interiorWindows, blinds — never the
// customer's selection order, so the same selections always serialize to
// the exact same string). Boolean extras appear as their bare key;
// quantity extras appear as "key:qty". No extras selected -> the literal
// string "none".
//
// Examples:
//   "none"
//   "kitchenCabinets;oven"
//   "interiorWindows:3;blinds:2"
//
// Migrating to relational rows later is a two-step split: `.split(";")`
// for each extra, then `.split(":")` to separate the key from an optional
// quantity.
import "server-only";
import type { ExtrasState } from "@/lib/booking/types";

export function serializeExtras(extras: ExtrasState): string {
  if (extras.noExtras) return "none";

  const tokens: string[] = [];
  if (extras.kitchenCabinets) tokens.push("kitchenCabinets");
  if (extras.refrigerator) tokens.push("refrigerator");
  if (extras.oven) tokens.push("oven");
  if (extras.interiorWindowsQty > 0) tokens.push(`interiorWindows:${extras.interiorWindowsQty}`);
  if (extras.blindsQty > 0) tokens.push(`blinds:${extras.blindsQty}`);

  return tokens.length > 0 ? tokens.join(";") : "none";
}

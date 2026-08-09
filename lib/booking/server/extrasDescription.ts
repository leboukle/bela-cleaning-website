// SERVER-ONLY. Turns the compact, stable Extras column format (see
// extras.ts's own format comment — e.g. "kitchenCabinets;interiorWindows:3"
// or "none") back into a human-readable list for the email templates.
// Deliberately kept separate from extras.ts: that module owns the
// serialization contract written to the sheet; this one is purely a
// display concern for notifications and could change independently.
import "server-only";
import { EXTRAS_CONFIG } from "@/lib/booking/config";

const LABELS_BY_KEY: Record<string, string> = {
  kitchenCabinets: EXTRAS_CONFIG.kitchenCabinets.label,
  refrigerator: EXTRAS_CONFIG.refrigerator.label,
  oven: EXTRAS_CONFIG.oven.label,
  interiorWindows: EXTRAS_CONFIG.interiorWindows.label,
  blinds: EXTRAS_CONFIG.blinds.label,
};

/** Returns `[]` for "none" (callers decide how to render "no extras"). */
export function describeExtras(serializedExtras: string): string[] {
  if (serializedExtras === "none" || serializedExtras.trim().length === 0) return [];

  return serializedExtras.split(";").map((token) => {
    const [key, quantity] = token.split(":");
    const label = LABELS_BY_KEY[key] ?? key;
    return quantity ? `${label} × ${quantity}` : label;
  });
}

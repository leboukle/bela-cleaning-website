// Centralized, typed service-area configuration for the booking prototype.
// SINGLE SOURCE OF TRUTH: SUPPORTED_ZIP_CODES below is the only place a
// supported ZIP code is listed anywhere in the app. LocationStep and
// ServiceAddressStep both import isZipSupported()/isValidZipFormat() from
// here rather than hardcoding or duplicating ZIPs; do not add a second
// list elsewhere — extend this array instead.
//
// PROTOTYPE DATA — REVIEW BEFORE LAUNCH: the ZIP codes below are the
// commonly-published residential ZIP codes for each city, compiled from
// general knowledge rather than BeLa Cleaning's own authoritative service
// map. They are a reasonable starting point for this milestone's instant
// "is this ZIP in range" check, but should be reviewed and corrected by
// the business (some ZIPs span multiple towns, and a few PO-box-only or
// commercial-only codes were intentionally excluded) before this becomes
// the real service-area source of truth.
//
// FUTURE MILESTONE: once the admin dashboard exists, this hardcoded array
// should be replaced by a database-backed service-area table (so staff
// can add/remove ZIPs without a code change) — isZipSupported(),
// isValidZipFormat(), and getCityForZip() below are the only functions
// that would need new (likely async) implementations; every call site in
// the booking flow already goes through these three functions rather than
// touching SUPPORTED_ZIP_CODES directly, so the swap should be contained
// to this file.
export type ServiceAreaZip = {
  zip: string;
  city: string;
};

export const SUPPORTED_ZIP_CODES: ServiceAreaZip[] = [
  // Jersey City
  { zip: "07302", city: "Jersey City" },
  { zip: "07304", city: "Jersey City" },
  { zip: "07305", city: "Jersey City" },
  { zip: "07306", city: "Jersey City" },
  { zip: "07307", city: "Jersey City" },
  { zip: "07310", city: "Jersey City" },
  // Hoboken
  { zip: "07030", city: "Hoboken" },
  // Bayonne
  { zip: "07002", city: "Bayonne" },
  // Harrison
  { zip: "07029", city: "Harrison" },
  // Newark
  { zip: "07102", city: "Newark" },
  { zip: "07103", city: "Newark" },
  { zip: "07104", city: "Newark" },
  { zip: "07105", city: "Newark" },
  { zip: "07106", city: "Newark" },
  { zip: "07107", city: "Newark" },
  { zip: "07108", city: "Newark" },
  { zip: "07112", city: "Newark" },
];

const SUPPORTED_ZIP_SET = new Set(SUPPORTED_ZIP_CODES.map((entry) => entry.zip));

// A real, supported ZIP for use as UI example/placeholder text (e.g. the
// location input's placeholder) — sourced from the list above instead of
// being separately hardcoded, so it can never drift out of sync with it.
// Looked up by value (not array index) so this stays exactly "07030"
// (Hoboken) regardless of how SUPPORTED_ZIP_CODES is reordered later.
export const EXAMPLE_SUPPORTED_ZIP =
  SUPPORTED_ZIP_CODES.find((entry) => entry.zip === "07030")?.zip ?? SUPPORTED_ZIP_CODES[0].zip;

export const ZIP_FORMAT_REGEX = /^\d{5}$/;

export function isValidZipFormat(zip: string): boolean {
  return ZIP_FORMAT_REGEX.test(zip.trim());
}

export function isZipSupported(zip: string): boolean {
  return SUPPORTED_ZIP_SET.has(zip.trim());
}

export function getCityForZip(zip: string): string | null {
  return SUPPORTED_ZIP_CODES.find((entry) => entry.zip === zip.trim())?.city ?? null;
}

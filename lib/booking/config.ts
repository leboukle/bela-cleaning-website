// Centralized, typed pricing and duration configuration for the booking
// prototype. Every dollar figure and time estimate referenced anywhere in
// the /booking-preview flow should come from this file — no values should
// be hard-coded in components. This keeps the milestone's business rules
// auditable in one place and makes it straightforward to swap in
// database-backed pricing later without touching the UI layer.
import type {
  BathroomId,
  BedroomId,
  CleaningTypeId,
  FrequencyId,
  PropertyTypeId,
  SquareFootageId,
  StepId,
} from "./types";

export type BedroomOption = {
  id: BedroomId;
  label: string;
  price: number | null;
  durationMinutes: number | null;
  customEstimate?: true;
};

export const BEDROOM_OPTIONS: BedroomOption[] = [
  { id: "studio", label: "Studio", price: 99, durationMinutes: 90 },
  { id: "1", label: "1 bedroom", price: 115, durationMinutes: 120 },
  { id: "2", label: "2 bedrooms", price: 130, durationMinutes: 150 },
  { id: "3", label: "3 bedrooms", price: 155, durationMinutes: 180 },
  { id: "4", label: "4 bedrooms", price: 175, durationMinutes: 210 },
  { id: "5", label: "5 bedrooms", price: 200, durationMinutes: 240 },
  { id: "more-than-5", label: "More than 5 bedrooms", price: null, durationMinutes: null, customEstimate: true },
];

export type BathroomOption = {
  id: BathroomId;
  label: string;
  priceAdd: number | null;
  durationMinutes: number | null;
  note?: string;
  customEstimate?: true;
};

export const BATHROOM_OPTIONS: BathroomOption[] = [
  { id: "1", label: "1 bathroom", priceAdd: 0, durationMinutes: 0, note: "Included" },
  { id: "1.5", label: "1.5 bathrooms", priceAdd: 15, durationMinutes: 45 },
  { id: "2", label: "2 bathrooms", priceAdd: 20, durationMinutes: 60 },
  { id: "2.5", label: "2.5 bathrooms", priceAdd: 35, durationMinutes: 75 },
  { id: "3", label: "3 bathrooms", priceAdd: 40, durationMinutes: 90 },
  { id: "4", label: "4 bathrooms", priceAdd: 45, durationMinutes: 105 },
  { id: "more-than-4", label: "More than 4 bathrooms", priceAdd: null, durationMinutes: null, customEstimate: true },
];

export type CleaningTypeOption = {
  id: CleaningTypeId;
  label: string;
  description: string;
  priceAdd: number;
  durationMinutes: number;
};

export const CLEANING_TYPE_OPTIONS: CleaningTypeOption[] = [
  {
    id: "standard",
    label: "Standard cleaning",
    description: "Routine upkeep for a home that's already in good shape.",
    priceAdd: 0,
    durationMinutes: 0,
  },
  {
    id: "move-in",
    label: "Move-in cleaning",
    description: "A thorough clean so a new home feels fresh before you unpack.",
    priceAdd: 60,
    durationMinutes: 60,
  },
  {
    id: "deep",
    label: "Deep cleaning",
    description: "Extra attention to buildup and detail beyond routine upkeep.",
    priceAdd: 100,
    durationMinutes: 90,
  },
  {
    id: "move-out",
    label: "Move-out cleaning",
    description: "A detailed clean to help leave a home in great condition.",
    priceAdd: 120,
    durationMinutes: 120,
  },
];

export type FrequencyOption = {
  id: FrequencyId;
  label: string;
  discount: number;
  discountLabel: string;
};

export const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { id: "one-time", label: "One time", discount: 0, discountLabel: "No discount" },
  { id: "weekly", label: "Weekly", discount: 0.15, discountLabel: "15% discount" },
  { id: "biweekly", label: "Every other week", discount: 0.1, discountLabel: "10% discount" },
  { id: "monthly", label: "Monthly", discount: 0.05, discountLabel: "5% discount" },
];

export type SquareFootageOption = {
  id: SquareFootageId;
  label: string;
  customEstimate?: true;
};

export const SQUARE_FOOTAGE_OPTIONS: SquareFootageOption[] = [
  { id: "up-to-1000", label: "Up to 1,000 sq. ft." },
  { id: "1001-2000", label: "1,001–2,000 sq. ft." },
  { id: "2001-3000", label: "2,001–3,000 sq. ft." },
  { id: "3001-4000", label: "3,001–4,000 sq. ft." },
  { id: "more-than-4000", label: "More than 4,000 sq. ft.", customEstimate: true },
];

export type PropertyTypeOption = {
  id: PropertyTypeId;
  label: string;
};

export const PROPERTY_TYPE_OPTIONS: PropertyTypeOption[] = [
  { id: "apartment", label: "Apartment" },
  { id: "condo", label: "Condo" },
  { id: "townhouse", label: "Townhouse" },
  { id: "single-family", label: "Single-family home" },
  { id: "duplex", label: "Duplex" },
  { id: "mother-daughter", label: "Mother-daughter home" },
  { id: "short-term-rental", label: "Short-term rental" },
  { id: "other", label: "Other" },
];

// Flat-fee extras (booleans) and per-unit extras (quantity-based).
export const EXTRAS_CONFIG = {
  kitchenCabinets: { label: "Inside kitchen cabinets", price: 30, durationMinutes: 30 },
  refrigerator: { label: "Inside refrigerator", price: 20, durationMinutes: 30 },
  oven: { label: "Inside oven", price: 20, durationMinutes: 30 },
  interiorWindows: {
    label: "Interior windows",
    unitLabel: "window",
    pricePerUnit: 15,
    durationPerUnitMinutes: 15,
  },
  blinds: {
    label: "Blinds",
    unitLabel: "blind",
    pricePerUnit: 15,
    // UNRESOLVED BUSINESS RULE: per-blind cleaning duration has not been
    // finalized by the business. Intentionally `null` — do not add a
    // duration value here until that rule is confirmed. See
    // calculate.ts's calculateExtrasDuration(), which explicitly skips
    // blinds when summing duration.
    durationPerUnitMinutes: null as number | null,
  },
} as const;

// Maps each step in the linear flow to the progress-indicator stage it
// belongs to. "intro" has no stage (the progress bar isn't shown yet).
export const STEP_STAGE: Partial<Record<StepId, string>> = {
  "property-type": "Property",
  "square-footage": "Property",
  bedrooms: "Service",
  bathrooms: "Service",
  "cleaning-type": "Service",
  extras: "Extras",
  frequency: "Frequency",
  schedule: "Schedule",
  details: "Details",
  review: "Review",
};

export const PROGRESS_STAGES = ["Property", "Service", "Extras", "Frequency", "Schedule", "Details", "Review"] as const;

export function getBedroomOption(id: BedroomId): BedroomOption {
  const option = BEDROOM_OPTIONS.find((o) => o.id === id);
  if (!option) throw new Error(`Unknown bedroom option: ${id}`);
  return option;
}

export function getBathroomOption(id: BathroomId): BathroomOption {
  const option = BATHROOM_OPTIONS.find((o) => o.id === id);
  if (!option) throw new Error(`Unknown bathroom option: ${id}`);
  return option;
}

export function getCleaningTypeOption(id: CleaningTypeId): CleaningTypeOption {
  const option = CLEANING_TYPE_OPTIONS.find((o) => o.id === id);
  if (!option) throw new Error(`Unknown cleaning type option: ${id}`);
  return option;
}

export function getFrequencyOption(id: FrequencyId): FrequencyOption {
  const option = FREQUENCY_OPTIONS.find((o) => o.id === id);
  if (!option) throw new Error(`Unknown frequency option: ${id}`);
  return option;
}

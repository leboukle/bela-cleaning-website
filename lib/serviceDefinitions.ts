// Single centralized source of truth for what each cleaning service
// includes and does not include. Consumed by the public Services page
// (lib/services.ts / app/services/page.tsx) and by the customer-facing
// booking-confirmation and 72-hour-reminder emails
// (lib/booking/server/email/templates/*) — none of those may hardcode
// their own copy of these lists; they all call getServiceScope() below.
//
// `ServiceType` is intentionally the same union as the booking flow's
// `CleaningTypeId` (see lib/booking/types.ts) rather than a parallel type,
// so a booking's actual cleaning type always maps directly onto this data
// with no separate translation table to keep in sync.
import type { CleaningTypeId } from "./booking/types";

export type ServiceType = CleaningTypeId;

// Mirrors the real, purchasable extras a customer can select during
// booking (see EXTRAS_CONFIG in lib/booking/config.ts and the
// "kitchenCabinets;interiorWindows:3"-style serialization in
// lib/booking/server/extras.ts) — deliberately the exact same key names,
// so a booking's parsed Extras column value can be used here with no
// translation layer.
export type AddOnType =
  | "kitchenCabinets"
  | "refrigerator"
  | "oven"
  | "interiorWindows"
  | "blinds";

export interface AddOnDefinition {
  name: string;
  description: string;
}

export const ADD_ON_DEFINITIONS: Record<AddOnType, AddOnDefinition> = {
  kitchenCabinets: {
    name: "Inside Kitchen Cabinets",
    description: "Cleaning of accessible empty cabinet and drawer interiors.",
  },
  refrigerator: {
    name: "Inside Refrigerator",
    description: "Cleaning of accessible interior refrigerator surfaces.",
  },
  oven: {
    name: "Inside Oven",
    description: "Cleaning of accessible interior oven surfaces.",
  },
  interiorWindows: {
    name: "Interior Windows",
    description: "Cleaning of accessible interior window glass.",
  },
  blinds: {
    name: "Blinds",
    description: "Cleaning of accessible blinds.",
  },
};

export interface ExclusionItem {
  text: string;
  // When set, getServiceScope() removes this exclusion for a specific
  // booking once every one of these add-ons has been purchased — so a
  // customer who paid for (say) interior windows is never simultaneously
  // told interior windows aren't included. Each exclusion today names
  // exactly the one add-on that covers it (oven and refrigerator are
  // separate exclusions, each tied only to its own add-on, so buying one
  // never affects the other's exclusion) — kept as an array rather than a
  // single key in case a future exclusion is ever genuinely only covered
  // by purchasing more than one add-on together.
  addOnKeys?: AddOnType[];
}

export interface ServiceDefinition {
  name: string;
  description: string;
  includes: string[];
  excludes: ExclusionItem[];
}

// Move-In and Move-Out Cleaning are two distinct booking-flow cleaning
// types (separate pricing/duration in CLEANING_TYPE_OPTIONS) but share
// identical scope copy — defined once here and reused for both entries
// below so the Services page's combined "Move-In and Move-Out Cleaning"
// section and either type's own confirmation/reminder emails never drift
// out of sync with each other.
const MOVE_IN_OUT_DESCRIPTION =
  "A detailed service for empty or mostly empty homes during a move, turnover, or fresh start.";

const MOVE_IN_OUT_INCLUDES: string[] = [
  "Cleaning of empty or mostly empty rooms",
  "Kitchen and bathroom surfaces",
  "Inside empty cabinets and drawers",
  "Closets and accessible shelving",
  "Baseboards",
  "Doors, frames, and trim",
  "Floors",
  "Exterior of appliances",
  "Detailed cleaning of accessible surfaces",
];

const MOVE_IN_OUT_EXCLUDES: ExclusionItem[] = [
  { text: "Inside oven unless selected as an add-on", addOnKeys: ["oven"] },
  { text: "Inside refrigerator unless selected as an add-on", addOnKeys: ["refrigerator"] },
  { text: "Removal of furniture or personal belongings" },
  { text: "Trash, junk, or bulk-item removal" },
  { text: "Packing or unpacking" },
  { text: "Wall washing or paint/stain removal" },
  { text: "Interior windows", addOnKeys: ["interiorWindows"] },
  { text: "Moving heavy furniture or appliances" },
  { text: "Mold, biohazards, or hazardous waste" },
];

export const SERVICE_DEFINITIONS: Record<ServiceType, ServiceDefinition> = {
  standard: {
    name: "Standard Cleaning",
    description: "Designed for regularly maintained homes that need dependable routine care.",

    includes: [
      "Kitchen surfaces and countertops",
      "Exterior of appliances",
      "Sinks and faucets",
      "Toilets, tubs, and showers",
      "Bathroom surfaces and fixtures",
      "Bedroom, living, and dining surfaces",
      "Dusting of accessible surfaces",
      "Vacuuming and mopping",
      "General tidying of cleaned areas",
    ],

    excludes: [
      { text: "Inside oven unless selected as an add-on", addOnKeys: ["oven"] },
      { text: "Inside refrigerator unless selected as an add-on", addOnKeys: ["refrigerator"] },
      { text: "Inside cabinets or drawers", addOnKeys: ["kitchenCabinets"] },
      { text: "Baseboards, doors, and trim detailing" },
      { text: "Heavy buildup or extensive scrubbing" },
      { text: "Interior windows", addOnKeys: ["interiorWindows"] },
      { text: "Moving heavy furniture" },
      { text: "Laundry, dishes, or organization" },
      { text: "Mold, biohazards, or hazardous waste" },
    ],
  },

  deep: {
    name: "Deep Cleaning",
    description:
      "A more detailed service for homes that have not been professionally cleaned recently or need additional attention beyond routine upkeep.",

    includes: [
      "Everything included in Standard Cleaning",
      "More detailed surface cleaning",
      "Baseboards where accessible",
      "Doors, frames, and trim",
      "Detailed kitchen cleaning",
      "Detailed bathroom cleaning",
      "Additional attention to buildup",
      "Additional cleaning of high-use areas",
      "Cleaning beneath or behind light, movable items where accessible",
    ],

    excludes: [
      { text: "Inside oven unless selected as an add-on", addOnKeys: ["oven"] },
      { text: "Inside refrigerator unless selected as an add-on", addOnKeys: ["refrigerator"] },
      { text: "Inside cabinets or drawers unless separately selected", addOnKeys: ["kitchenCabinets"] },
      { text: "Interior windows", addOnKeys: ["interiorWindows"] },
      { text: "Moving heavy furniture or appliances" },
      { text: "Laundry, dishes, or organization" },
      { text: "Mold, biohazards, or hazardous waste" },
      { text: "Restoration of permanently stained or damaged surfaces" },
    ],
  },

  "move-in": {
    name: "Move-In Cleaning",
    description: MOVE_IN_OUT_DESCRIPTION,
    includes: MOVE_IN_OUT_INCLUDES,
    excludes: MOVE_IN_OUT_EXCLUDES,
  },

  "move-out": {
    name: "Move-Out Cleaning",
    description: MOVE_IN_OUT_DESCRIPTION,
    includes: MOVE_IN_OUT_INCLUDES,
    excludes: MOVE_IN_OUT_EXCLUDES,
  },
};

export interface ServiceScope {
  serviceType: ServiceType;
  serviceName: string;
  description: string;
  includes: string[];
  /** Excludes with any fully-purchased add-on already removed — see ExclusionItem.addOnKeys. */
  excludes: string[];
  selectedAddOns: Array<{ key: AddOnType; name: string; description: string }>;
}

/**
 * Type guard for a raw extras key (e.g. from extras.ts's parseExtrasKeys)
 * being one of this module's known AddOnType values — lets callers filter
 * a booking's parsed Extras column down to exactly the keys getServiceScope
 * understands, with no separate hardcoded key list to keep in sync.
 */
export function isAddOnType(key: string): key is AddOnType {
  return Object.prototype.hasOwnProperty.call(ADD_ON_DEFINITIONS, key);
}

/**
 * Resolves one booking's (or the public Services page's) effective scope
 * for a service type. Called with `selectedAddOns: []` (the default) this
 * simply returns the full, unfiltered lists — exactly what the public
 * Services page shows, since it has no specific customer or add-on
 * selection to reason about. Called with a specific booking's selected
 * add-ons, it additionally drops any exclusion that add-on set has fully
 * satisfied, so a confirmation or reminder email never tells a customer
 * something "is not included" when they in fact paid for it.
 */
export function getServiceScope(serviceType: ServiceType, selectedAddOns: AddOnType[] = []): ServiceScope {
  const service = SERVICE_DEFINITIONS[serviceType];
  const selected = new Set(selectedAddOns);

  const excludes = service.excludes
    .filter((item) => !(item.addOnKeys && item.addOnKeys.every((key) => selected.has(key))))
    .map((item) => item.text);

  return {
    serviceType,
    serviceName: service.name,
    description: service.description,
    includes: service.includes,
    excludes,
    selectedAddOns: selectedAddOns.map((key) => ({ key, ...ADD_ON_DEFINITIONS[key] })),
  };
}

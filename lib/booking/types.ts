// Shared types for the booking-preview prototype. Kept separate from
// config.ts so option data and the shape of in-progress booking state can
// evolve independently. This state shape is intentionally flat and
// serializable (no functions, no class instances) so it can later be
// persisted to a database record or sent to an API without restructuring.

export type PropertyTypeId =
  | "apartment"
  | "condo"
  | "townhouse"
  | "single-family"
  | "duplex"
  | "mother-daughter"
  | "short-term-rental"
  | "other";

export type SquareFootageId =
  | "up-to-1000"
  | "1001-2000"
  | "2001-3000"
  | "3001-4000"
  | "more-than-4000";

export type BedroomId = "studio" | "1" | "2" | "3" | "4" | "5" | "more-than-5";

export type BathroomId = "1" | "1.5" | "2" | "2.5" | "3" | "4" | "more-than-4";

export type CleaningTypeId = "standard" | "move-in" | "deep" | "move-out";

export type FrequencyId = "one-time" | "weekly" | "biweekly" | "monthly";

// The linear question sequence. Note: "cleaning-type" is asked before
// "extras" here so the visible progress stages (Property / Service /
// Extras / Frequency / Schedule / Details / Review) advance in one
// direction only — see STEP_STAGE in config.ts and the milestone report
// for why this differs from the extras-before-cleaning-type order the
// questions were listed in.
export const STEP_ORDER = [
  "intro",
  "property-type",
  "square-footage",
  "bedrooms",
  "bathrooms",
  "cleaning-type",
  "extras",
  "frequency",
  "schedule",
  "details",
  "review",
] as const;

export type StepId = (typeof STEP_ORDER)[number];

// Which prior answer (if any) currently requires a custom estimate and is
// blocking the instant-booking flow.
export type CustomEstimateTrigger = "square-footage" | "bedrooms" | "bathrooms" | null;

export type ExtrasState = {
  kitchenCabinets: boolean;
  refrigerator: boolean;
  oven: boolean;
  interiorWindowsQty: number;
  blindsQty: number;
  noExtras: boolean;
};

export type BookingState = {
  stepIndex: number;
  customEstimateTrigger: CustomEstimateTrigger;
  customEstimateNotes: string;
  propertyType: PropertyTypeId | null;
  propertyTypeOther: string;
  squareFootage: SquareFootageId | null;
  bedrooms: BedroomId | null;
  bathrooms: BathroomId | null;
  cleaningType: CleaningTypeId | null;
  extras: ExtrasState;
  frequency: FrequencyId | null;
};

export const initialExtrasState: ExtrasState = {
  kitchenCabinets: false,
  refrigerator: false,
  oven: false,
  interiorWindowsQty: 0,
  blindsQty: 0,
  noExtras: false,
};

export const initialBookingState: BookingState = {
  stepIndex: 0,
  customEstimateTrigger: null,
  customEstimateNotes: "",
  propertyType: null,
  propertyTypeOther: "",
  squareFootage: null,
  bedrooms: null,
  bathrooms: null,
  cleaningType: null,
  extras: initialExtrasState,
  frequency: null,
};

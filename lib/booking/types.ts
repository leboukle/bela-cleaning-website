// Shared types for the booking flow. Kept separate from
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

export type ArrivalWindowId = "morning" | "midday" | "early-afternoon" | "afternoon";

export type AccessId = "home" | "not-home";

// The linear question sequence. Note: "cleaning-type" is asked before
// "extras" here so the visible progress stages (Property / Service /
// Extras / Frequency / Location / Schedule / Details / Review) advance in
// one direction only — see STEP_STAGE in config.ts and the Milestone 1
// report for why this differs from the extras-before-cleaning-type order
// the questions were originally listed in.
//
// Milestone 2A extends the flow past "frequency" with fine-grained steps
// grouped under four new coarse stages (Location, Schedule, Details x6).
// Each stage groups multiple StepIds — see EDIT_GROUPS in config.ts, which
// the Review step's "Edit" links and BookingFlow's edit-return logic key
// off of.
export const STEP_ORDER = [
  "intro",
  "property-type",
  "square-footage",
  "bedrooms",
  "bathrooms",
  "cleaning-type",
  "extras",
  "frequency",
  "location",
  "schedule-date",
  "arrival-window",
  "customer-name",
  "customer-email",
  "customer-phone",
  "service-address",
  "access",
  "special-instructions",
  "payment",
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

  // --- Milestone 2A additions below ---

  // Service-area / location step
  zipCode: string;
  zipCodeChecked: boolean;
  zipCodeSupported: boolean;
  outOfAreaMessage: string;

  // Schedule
  appointmentDate: string | null; // ISO yyyy-mm-dd, always interpreted as a local calendar date
  arrivalWindow: ArrivalWindowId | null;

  // Customer info — client-side prototype state only, never submitted.
  // See CustomerNameStep/CustomerEmailStep/CustomerPhoneStep for the
  // "server-side validation required later" note.
  firstName: string;
  lastName: string;
  email: string;
  phone: string;

  // Service address — zip prefilled from the location step, independently
  // editable and revalidated against the service area.
  addressStreet: string;
  addressUnit: string;
  addressCity: string;
  addressState: string;
  addressZip: string;

  someoneHome: AccessId | null;
  specialInstructions: string;

  agreedToPolicy: boolean;

  // Milestone 5: the confirmed Stripe SetupIntent ID from the Payment
  // step, carried into the final /api/booking submission. Never anything
  // else payment-related (no card data ever reaches this client state) —
  // see PaymentStep.tsx and lib/booking/server/stripe/setupIntent.ts.
  setupIntentId: string | null;

  // Set by the Review step's "Edit" links so the relevant group's last
  // step can jump straight back to Review instead of continuing linearly
  // through the rest of the flow. See BookingFlow's `advance()`.
  returnToStepId: StepId | null;
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

  zipCode: "",
  zipCodeChecked: false,
  zipCodeSupported: false,
  outOfAreaMessage: "",

  appointmentDate: null,
  arrivalWindow: null,

  firstName: "",
  lastName: "",
  email: "",
  phone: "",

  addressStreet: "",
  addressUnit: "",
  addressCity: "",
  addressState: "New Jersey",
  addressZip: "",

  someoneHome: null,
  specialInstructions: "",

  agreedToPolicy: false,

  setupIntentId: null,

  returnToStepId: null,
};

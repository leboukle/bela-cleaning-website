// SERVER-ONLY. Single source of truth for the "Recurring Schedules" and
// "Recurring Schedule Events" worksheets: their exact column order, the
// typed record each row maps to, and the small status vocabularies.
//
// One row per recurring schedule — a persistent record of WHAT was agreed
// (cadence, anchor date and local time, service details, agreed pricing,
// saved Stripe references) and HOW FAR generation has progressed. Each
// appointment is still its own ordinary row on the Bookings sheet, linked
// by Bookings "Recurring Schedule ID" + "Occurrence Number". The Events
// worksheet is an append-only audit trail that also serves as the
// "claim once" primitive for one-time side effects (see
// recurringScheduleRepository.claimOnce).
import "server-only";

export const SCHEDULES_SHEET_NAME = "Recurring Schedules";
export const SCHEDULE_EVENTS_SHEET_NAME = "Recurring Schedule Events";

export const SCHEDULE_STATUS = {
  ACTIVE: "Active",
  /** Generation halted (e.g. final payment failure); only the owner resumes it. */
  PAUSED: "Paused",
  /** Terminal: no further appointments are ever generated. History is kept. */
  ENDED: "Ended",
} as const;

/** Why a schedule is waiting on the owner. Blank when nothing is wrong. */
export const REVIEW_REASON = {
  BLACKOUT: "blackout",
  UNAVAILABLE: "unavailable",
  TOO_SOON: "too-soon",
  /** The visit date passed but its payment is still not confirmed (and not retrying / failed). */
  PAYMENT_NOT_CONFIRMED: "payment-not-confirmed",
  PAYMENT_FINAL_FAILURE: "payment-final-failure",
  DUPLICATE_DETECTED: "duplicate-detected",
  GENERATION_ERROR: "generation-error",
} as const;

export const ENDED_REASON = {
  CUSTOMER_STOPPED: "customer-stopped",
  OWNER_ENDED: "owner-ended",
} as const;

export const EVENT_TYPE = {
  SCHEDULE_CREATED: "schedule-created",
  SCHEDULE_REPAIRED: "schedule-repaired",
  OCCURRENCE_CREATED: "occurrence-created",
  OCCURRENCE_SKIPPED: "occurrence-skipped",
  DUPLICATE_VOIDED: "duplicate-voided",
  GENERATION_BLOCKED: "generation-blocked",
  ISSUE_RESOLVED: "issue-resolved",
  SCHEDULE_PAUSED: "schedule-paused",
  SCHEDULE_RESUMED: "schedule-resumed",
  SCHEDULE_ENDED: "schedule-ended",
  SCHEDULE_CONVERTED: "schedule-converted",
  APPOINTMENT_UNPERFORMED: "appointment-unperformed",
  PAYMENT_FAILURE_ACKNOWLEDGED: "payment-failure-acknowledged",
  CLAIM: "claim",
} as const;

type FieldType = "string" | "number";

/**
 * Column definitions, in sheet order. `key` is the property on
 * RecurringScheduleRecord. Do not reorder or remove: this array IS the
 * worksheet contract (see docs/recurring-schedules.md).
 */
export const SCHEDULE_FIELDS = [
  { column: "Schedule ID", key: "scheduleId", type: "string" },
  { column: "Status", key: "status", type: "string" },
  { column: "Review Reason", key: "reviewReason", type: "string" },
  { column: "Review Since", key: "reviewSince", type: "string" },
  { column: "Frequency", key: "frequency", type: "string" },
  { column: "Frequency Rate", key: "frequencyRate", type: "number" },
  { column: "Anchor Date", key: "anchorDate", type: "string" },
  { column: "Anchor Start Time", key: "anchorStartTime", type: "string" },
  { column: "Timezone", key: "timezone", type: "string" },
  { column: "First Name", key: "firstName", type: "string" },
  { column: "Last Name", key: "lastName", type: "string" },
  { column: "Email", key: "email", type: "string" },
  { column: "Mobile", key: "mobile", type: "string" },
  { column: "Street Address", key: "streetAddress", type: "string" },
  { column: "Apartment or Unit", key: "apartmentOrUnit", type: "string" },
  { column: "City", key: "city", type: "string" },
  { column: "State", key: "state", type: "string" },
  { column: "ZIP Code", key: "zipCode", type: "string" },
  { column: "Someone Home", key: "someoneHome", type: "string" },
  { column: "Property Type", key: "propertyType", type: "string" },
  { column: "Square Footage", key: "squareFootage", type: "string" },
  { column: "Bedrooms", key: "bedrooms", type: "string" },
  { column: "Bathrooms", key: "bathrooms", type: "string" },
  { column: "Cleaning Type", key: "cleaningType", type: "string" },
  { column: "Extras", key: "extras", type: "string" },
  { column: "Estimated Duration Minutes", key: "estimatedDurationMinutes", type: "number" },
  { column: "Special Instructions", key: "specialInstructions", type: "string" },
  { column: "Base Cleaning Price", key: "baseCleaningPrice", type: "number" },
  { column: "Bathroom Price", key: "bathroomPrice", type: "number" },
  { column: "Square Footage Price", key: "squareFootagePrice", type: "number" },
  { column: "Cleaning Type Price", key: "cleaningTypePrice", type: "number" },
  { column: "Extras Price", key: "extrasPrice", type: "number" },
  { column: "Full Price Total", key: "fullPriceTotal", type: "number" },
  { column: "Recurring Price Total", key: "recurringPriceTotal", type: "number" },
  { column: "Pricing Policy", key: "pricingPolicy", type: "string" },
  { column: "Stripe Customer ID", key: "stripeCustomerId", type: "string" },
  { column: "Stripe PaymentMethod ID", key: "stripePaymentMethodId", type: "string" },
  { column: "Stripe SetupIntent ID", key: "stripeSetupIntentId", type: "string" },
  { column: "Consent Version", key: "consentVersion", type: "string" },
  { column: "Consent At", key: "consentAt", type: "string" },
  { column: "Source Booking ID", key: "sourceBookingId", type: "string" },
  { column: "Created At", key: "createdAt", type: "string" },
  { column: "Next Occurrence Number", key: "nextOccurrenceNumber", type: "number" },
  { column: "Last Occurrence Number", key: "lastOccurrenceNumber", type: "number" },
  { column: "Last Booking ID", key: "lastBookingId", type: "string" },
  { column: "Last Generated At", key: "lastGeneratedAt", type: "string" },
  { column: "Ended At", key: "endedAt", type: "string" },
  { column: "Ended Reason", key: "endedReason", type: "string" },
] as const satisfies ReadonlyArray<{ column: string; key: string; type: FieldType }>;

export type ScheduleColumn = (typeof SCHEDULE_FIELDS)[number]["column"];

export type RecurringScheduleRecord = {
  scheduleId: string;
  status: string;
  reviewReason: string;
  reviewSince: string;
  /** Persisted frequency label: "Weekly" | "Every other week" | "Monthly". */
  frequency: string;
  /** The frequency's discount rate AT AGREEMENT (e.g. 0.15) — never re-read from config. */
  frequencyRate: number;
  /** The ORIGINAL first appointment's date (yyyy-mm-dd): the series anchor. */
  anchorDate: string;
  /** Local wall-clock start time ("HH:00") in `timezone`. */
  anchorStartTime: string;
  timezone: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  streetAddress: string;
  apartmentOrUnit: string;
  city: string;
  state: string;
  zipCode: string;
  someoneHome: string;
  propertyType: string;
  squareFootage: string;
  bedrooms: string;
  bathrooms: string;
  cleaningType: string;
  extras: string;
  estimatedDurationMinutes: number;
  specialInstructions: string;
  baseCleaningPrice: number;
  bathroomPrice: number;
  squareFootagePrice: number;
  cleaningTypePrice: number;
  extrasPrice: number;
  /** Total of an appointment with no frequency discount (what the first performed cleaning costs). */
  fullPriceTotal: number;
  /** The agreed recurring total per later appointment, for the unchanged service details. */
  recurringPriceTotal: number;
  pricingPolicy: string;
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  stripeSetupIntentId: string;
  consentVersion: string;
  consentAt: string;
  sourceBookingId: string;
  createdAt: string;
  /** The occurrence number generation will create next (>= highest existing + 1). */
  nextOccurrenceNumber: number;
  lastOccurrenceNumber: number;
  lastBookingId: string;
  lastGeneratedAt: string;
  endedAt: string;
  endedReason: string;
};

export const SCHEDULE_COLUMNS = SCHEDULE_FIELDS.map((f) => f.column);

function columnIndexToLetter(zeroBasedIndex: number): string {
  let n = zeroBasedIndex + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function scheduleColumnLetter(column: ScheduleColumn): string {
  const index = SCHEDULE_COLUMNS.indexOf(column);
  if (index === -1) throw new Error(`Unknown Recurring Schedules column: ${column}`);
  return columnIndexToLetter(index);
}

export function scheduleKeyColumnLetter(key: keyof RecurringScheduleRecord): string {
  const field = SCHEDULE_FIELDS.find((f) => f.key === key);
  if (!field) throw new Error(`Unknown schedule field: ${String(key)}`);
  return scheduleColumnLetter(field.column);
}

export const SCHEDULES_LAST_COLUMN_LETTER = columnIndexToLetter(SCHEDULE_FIELDS.length - 1);
export const SCHEDULES_FULL_RANGE = `${SCHEDULES_SHEET_NAME}!A:${SCHEDULES_LAST_COLUMN_LETTER}`;

export const SCHEDULE_EVENT_COLUMNS = [
  "Event ID",
  "Timestamp",
  "Schedule ID",
  "Occurrence Number",
  "Event Type",
  "Claim Key",
  "Detail",
] as const;

export type ScheduleEvent = {
  eventId: string;
  timestamp: string;
  scheduleId: string;
  occurrenceNumber: number | "";
  eventType: string;
  /** Non-empty only for claim events; unique per once-only side effect. */
  claimKey: string;
  detail: string;
};

export const SCHEDULE_EVENTS_FULL_RANGE = `${SCHEDULE_EVENTS_SHEET_NAME}!A:${columnIndexToLetter(SCHEDULE_EVENT_COLUMNS.length - 1)}`;

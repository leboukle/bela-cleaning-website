// SERVER-ONLY. Independent, from-scratch re-validation of a booking
// submission (STEP 8). Nothing the browser calculated or asserted is
// trusted — every value here is re-checked against the same centralized
// config the client UI itself is built from (config.ts, serviceArea.ts,
// schedule.ts, validation.ts), so the rules can never drift between the
// two, but a manipulated client request can never bypass them either.
import "server-only";
import {
  BATHROOM_OPTIONS,
  BEDROOM_OPTIONS,
  CLEANING_TYPE_OPTIONS,
  FREQUENCY_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  SQUARE_FOOTAGE_OPTIONS,
} from "@/lib/booking/config";
import { ARRIVAL_WINDOWS } from "@/lib/booking/schedule";
import { EXTRAS_QUANTITY_MAX, SPECIAL_INSTRUCTIONS_MAX_LENGTH } from "@/lib/booking/limits";
import { getCityForZip, isValidZipFormat, isZipSupported } from "@/lib/booking/serviceArea";
import { isValidEmail, isValidUsPhone, isNonEmpty } from "@/lib/booking/validation";
import type { AccessId, ExtrasState } from "@/lib/booking/types";
import { isValidDateKey, isPastOrWithinLeadWindow } from "./dateUtils";
import type { BookingSettings } from "./settings";
import type { BookingSubmissionInput, ValidatedBooking, ValidationIssue, ValidationResult } from "./types";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asTrimmedString(value: unknown): string {
  return asString(value).trim();
}

const MAX_TEXT_FIELD_LENGTH = 200; // sanity bound for name/address/email/etc.

export type ValidateSubmissionOptions = {
  settings: BookingSettings;
};

export function validateSubmission(input: BookingSubmissionInput, options: ValidateSubmissionOptions): ValidationResult {
  const issues: ValidationIssue[] = [];
  const addIssue = (field: string, message: string) => issues.push({ field, message });

  // --- Spam / integrity ---
  const honeypot = asString(input.honeypot);
  if (honeypot.length > 0) {
    // Returned as a normal validation failure rather than a distinct
    // signal — a bot should not be able to tell honeypot rejection apart
    // from an ordinary validation error.
    addIssue("honeypot", "Submission rejected.");
  }

  const idempotencyToken = asTrimmedString(input.idempotencyToken);
  if (!idempotencyToken || idempotencyToken.length > 100) {
    addIssue("idempotencyToken", "A valid submission token is required.");
  }

  // --- Customer data ---
  const firstName = asTrimmedString(input.firstName);
  if (!isNonEmpty(firstName) || firstName.length > MAX_TEXT_FIELD_LENGTH) {
    addIssue("firstName", "First name is required.");
  }
  const lastName = asTrimmedString(input.lastName);
  if (!isNonEmpty(lastName) || lastName.length > MAX_TEXT_FIELD_LENGTH) {
    addIssue("lastName", "Last name is required.");
  }
  const email = asTrimmedString(input.email);
  if (!isValidEmail(email) || email.length > MAX_TEXT_FIELD_LENGTH) {
    addIssue("email", "A valid email address is required.");
  }
  const phone = asTrimmedString(input.phone);
  if (!isValidUsPhone(phone)) {
    addIssue("phone", "A valid US mobile number is required.");
  }
  const addressStreet = asTrimmedString(input.addressStreet);
  if (!isNonEmpty(addressStreet) || addressStreet.length > MAX_TEXT_FIELD_LENGTH) {
    addIssue("addressStreet", "Street address is required.");
  }
  const addressUnit = asTrimmedString(input.addressUnit).slice(0, MAX_TEXT_FIELD_LENGTH);
  const addressCity = asTrimmedString(input.addressCity);
  if (!isNonEmpty(addressCity) || addressCity.length > MAX_TEXT_FIELD_LENGTH) {
    addIssue("addressCity", "City is required.");
  }
  const addressState = asTrimmedString(input.addressState);
  if (!isNonEmpty(addressState) || addressState.length > MAX_TEXT_FIELD_LENGTH) {
    addIssue("addressState", "State is required.");
  }

  // --- Service area ---
  // The ZIP on the address must itself be in the supported service area —
  // it is the address actually being cleaned. The earlier "Location" step
  // ZIP is only a preliminary check; the address ZIP is authoritative.
  const addressZip = asTrimmedString(input.addressZip);
  if (!isValidZipFormat(addressZip)) {
    addIssue("addressZip", "A valid 5-digit ZIP code is required.");
  } else if (!isZipSupported(addressZip)) {
    addIssue("addressZip", "This ZIP code is outside our current service area.");
  }
  const zipCode = asTrimmedString(input.zipCode) || addressZip;

  // --- Property / service enums (reject anything not in the approved
  // catalog — never accept an arbitrary client-supplied string) ---
  const propertyType = asTrimmedString(input.propertyType);
  const propertyTypeOption = PROPERTY_TYPE_OPTIONS.find((o) => o.id === propertyType);
  if (!propertyTypeOption) {
    addIssue("propertyType", "Please select a valid property type.");
  }
  const propertyTypeOther = asTrimmedString(input.propertyTypeOther).slice(0, MAX_TEXT_FIELD_LENGTH);
  if (propertyType === "other" && !isNonEmpty(propertyTypeOther)) {
    addIssue("propertyTypeOther", "Please describe the property type.");
  }

  const squareFootage = asTrimmedString(input.squareFootage);
  const squareFootageOption = SQUARE_FOOTAGE_OPTIONS.find((o) => o.id === squareFootage);
  if (!squareFootageOption || squareFootageOption.customEstimate) {
    addIssue("squareFootage", "Please select a valid, instantly-priced square footage.");
  }

  const bedrooms = asTrimmedString(input.bedrooms);
  const bedroomOption = BEDROOM_OPTIONS.find((o) => o.id === bedrooms);
  if (!bedroomOption || bedroomOption.customEstimate) {
    addIssue("bedrooms", "Please select a valid, instantly-priced bedroom count.");
  }

  const bathrooms = asTrimmedString(input.bathrooms);
  const bathroomOption = BATHROOM_OPTIONS.find((o) => o.id === bathrooms);
  if (!bathroomOption || bathroomOption.customEstimate) {
    addIssue("bathrooms", "Please select a valid, instantly-priced bathroom count.");
  }

  const cleaningType = asTrimmedString(input.cleaningType);
  if (!CLEANING_TYPE_OPTIONS.some((o) => o.id === cleaningType)) {
    addIssue("cleaningType", "Please select a valid cleaning type.");
  }

  const frequency = asTrimmedString(input.frequency);
  if (!FREQUENCY_OPTIONS.some((o) => o.id === frequency)) {
    addIssue("frequency", "Please select a valid frequency.");
  }

  // --- Extras ---
  let extras: ExtrasState = {
    kitchenCabinets: false,
    refrigerator: false,
    oven: false,
    interiorWindowsQty: 0,
    blindsQty: 0,
    noExtras: false,
  };
  const rawExtras = input.extras;
  if (typeof rawExtras !== "object" || rawExtras === null) {
    addIssue("extras", "Extras selection is invalid.");
  } else {
    const e = rawExtras as Record<string, unknown>;
    const kitchenCabinets = e.kitchenCabinets === true;
    const refrigerator = e.refrigerator === true;
    const oven = e.oven === true;
    const noExtras = e.noExtras === true;
    const interiorWindowsQty = Number(e.interiorWindowsQty);
    const blindsQty = Number(e.blindsQty);

    const quantitiesValid =
      Number.isInteger(interiorWindowsQty) &&
      interiorWindowsQty >= 0 &&
      interiorWindowsQty <= EXTRAS_QUANTITY_MAX &&
      Number.isInteger(blindsQty) &&
      blindsQty >= 0 &&
      blindsQty <= EXTRAS_QUANTITY_MAX;

    if (!quantitiesValid) {
      addIssue("extras", "Extras quantities are invalid.");
    } else if (noExtras && (kitchenCabinets || refrigerator || oven || interiorWindowsQty > 0 || blindsQty > 0)) {
      addIssue("extras", "\"No extras\" cannot be combined with other extras.");
    } else {
      extras = { kitchenCabinets, refrigerator, oven, interiorWindowsQty, blindsQty, noExtras };
    }
  }

  // --- Scheduling ---
  const serviceDate = asTrimmedString(input.serviceDate);
  if (!isValidDateKey(serviceDate)) {
    addIssue("serviceDate", "Please choose a valid appointment date.");
  } else if (isPastOrWithinLeadWindow(serviceDate, options.settings.timezone, options.settings.minimumLeadDays)) {
    addIssue("serviceDate", "That date is too soon. Please choose a date further out.");
  }

  const arrivalWindow = asTrimmedString(input.arrivalWindow);
  if (!ARRIVAL_WINDOWS.some((w) => w.id === arrivalWindow)) {
    addIssue("arrivalWindow", "Please select a valid arrival window.");
  }

  // --- Access & instructions ---
  const someoneHomeRaw = asTrimmedString(input.someoneHome);
  if (someoneHomeRaw !== "home" && someoneHomeRaw !== "not-home") {
    addIssue("someoneHome", "Please let us know whether someone will be home.");
  }
  const specialInstructions = asString(input.specialInstructions).slice(0, SPECIAL_INSTRUCTIONS_MAX_LENGTH).trim();

  // --- Policy ---
  if (input.agreedToPolicy !== true) {
    addIssue("agreedToPolicy", "You must agree to the Service Policy and Terms & Conditions.");
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const booking: ValidatedBooking = {
    propertyType: propertyType as ValidatedBooking["propertyType"],
    propertyTypeOther,
    squareFootage: squareFootage as ValidatedBooking["squareFootage"],
    bedrooms: bedrooms as ValidatedBooking["bedrooms"],
    bathrooms: bathrooms as ValidatedBooking["bathrooms"],
    cleaningType: cleaningType as ValidatedBooking["cleaningType"],
    extras,
    frequency: frequency as ValidatedBooking["frequency"],
    zipCode,
    city: getCityForZip(addressZip) ?? "",
    serviceDate,
    arrivalWindow: arrivalWindow as ValidatedBooking["arrivalWindow"],
    firstName,
    lastName,
    email,
    phone,
    addressStreet,
    addressUnit,
    addressCity,
    addressState,
    addressZip,
    someoneHome: someoneHomeRaw as AccessId,
    specialInstructions,
    agreedToPolicy: true,
    idempotencyToken,
  };

  return { ok: true, booking };
}

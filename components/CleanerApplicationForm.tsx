"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

const EXPERIENCE_OPTIONS = [
  "No professional cleaning experience",
  "Less than 1 year",
  "1–2 years",
  "3–5 years",
  "6–10 years",
  "More than 10 years",
];

const SUPPLIES_OPTIONS = ["Yes", "Some supplies, but not a complete kit", "No"];

const WORK_AREA_OPTIONS = ["Jersey City", "Hoboken", "Newark", "Nearby communities", "Other"];

const DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const TIME_OPTIONS = ["Mornings", "Afternoons", "Evenings", "Flexible"];

const ABOUT_MIN = 80;
const ABOUT_MAX = 1200;

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  experience: string;
  hasCar: string;
  hasSupplies: string;
  workAreas: string[];
  otherWorkArea: string;
  availableDays: string[];
  timeAvailability: string[];
  aboutYourself: string;
  additionalInfo: string;
  confirmAccurate: boolean;
  privacyAck: boolean;
};

type ListField = "workAreas" | "availableDays" | "timeAvailability";

type FormErrors = Partial<Record<keyof FormState, string>>;

const initialState: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  city: "",
  experience: "",
  hasCar: "",
  hasSupplies: "",
  workAreas: [],
  otherWorkArea: "",
  availableDays: [],
  timeAvailability: [],
  aboutYourself: "",
  additionalInfo: "",
  confirmAccurate: false,
  privacyAck: false,
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Read at build time from NEXT_PUBLIC_FORMSPREE_CLEANER_APPLICATION_URL.
// See .env.example. This must stay a direct process.env reference (not a
// computed lookup) so Next.js can inline it for the client bundle.
const FORMSPREE_ENDPOINT = process.env.NEXT_PUBLIC_FORMSPREE_CLEANER_APPLICATION_URL;

type SubmitStatus = "idle" | "submitting" | "success" | "error";

const SUCCESS_MESSAGE =
  "Thank you for your interest in BeLa Cleaning. Your application has been submitted for review. We will contact you if your availability and experience match a current need.";
const ERROR_MESSAGE =
  "We could not submit your application. Please check your information and try again.";

const inputClasses =
  "mt-1.5 w-full rounded-lg border border-soft-gray bg-pure-white px-4 py-2.5 text-charcoal placeholder:text-warm-text/60 focus:border-deep-green";
const labelClasses = "text-sm font-medium text-charcoal";
const errorClasses = "mt-1.5 text-sm text-red-700";
const legendClasses = "text-sm font-medium text-charcoal";
const checkboxRowClasses = "flex items-center gap-2 text-sm text-charcoal";

export default function CleanerApplicationForm() {
  const [values, setValues] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<SubmitStatus>("idle");

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function toggleListValue(field: ListField, value: string) {
    setValues((prev) => {
      const current = prev[field];
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];
      return { ...prev, [field]: next };
    });
  }

  function validate(): FormErrors {
    const nextErrors: FormErrors = {};
    if (!values.firstName.trim()) nextErrors.firstName = "Please enter your first name.";
    if (!values.lastName.trim()) nextErrors.lastName = "Please enter your last name.";
    if (!values.email.trim()) {
      nextErrors.email = "Please enter your email address.";
    } else if (!emailPattern.test(values.email.trim())) {
      nextErrors.email = "Please enter a valid email address.";
    }
    if (!values.phone.trim()) nextErrors.phone = "Please enter your phone number.";
    if (!values.city.trim()) nextErrors.city = "Please tell us where you are based.";
    if (!values.experience) nextErrors.experience = "Please select your cleaning experience.";
    if (!values.hasCar) nextErrors.hasCar = "Please let us know about car access.";
    if (!values.hasSupplies)
      nextErrors.hasSupplies = "Please let us know about supplies and equipment.";
    if (values.workAreas.length === 0)
      nextErrors.workAreas = "Please select at least one work area.";
    if (values.workAreas.includes("Other") && !values.otherWorkArea.trim()) {
      nextErrors.otherWorkArea = "Please specify.";
    }
    if (values.availableDays.length === 0)
      nextErrors.availableDays = "Please select at least one day.";
    if (values.timeAvailability.length === 0)
      nextErrors.timeAvailability = "Please select at least one time period.";

    const aboutLength = values.aboutYourself.trim().length;
    if (aboutLength < ABOUT_MIN) {
      nextErrors.aboutYourself = `Please enter at least ${ABOUT_MIN} characters (currently ${aboutLength}).`;
    } else if (values.aboutYourself.length > ABOUT_MAX) {
      nextErrors.aboutYourself = `Please limit this to ${ABOUT_MAX} characters.`;
    }

    if (!values.confirmAccurate)
      nextErrors.confirmAccurate = "Please confirm this information is accurate.";
    if (!values.privacyAck) nextErrors.privacyAck = "Please acknowledge the Privacy Policy.";

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (!FORMSPREE_ENDPOINT) {
      // Never fake a success message when the form isn't configured.
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "NEXT_PUBLIC_FORMSPREE_CLEANER_APPLICATION_URL is not set. Add it to .env.local (see .env.example) to enable cleaner application submissions.",
        );
      }
      setStatus("error");
      return;
    }

    setStatus("submitting");

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          phone: values.phone,
          city: values.city,
          experience: values.experience,
          hasCar: values.hasCar,
          hasSupplies: values.hasSupplies,
          workAreas: values.workAreas,
          otherWorkArea: values.otherWorkArea,
          availableDays: values.availableDays,
          timeAvailability: values.timeAvailability,
          aboutYourself: values.aboutYourself,
          additionalInfo: values.additionalInfo,
        }),
      });

      if (response.ok) {
        setStatus("success");
        setValues(initialState);
        setErrors({});
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="border border-soft-gray bg-pure-white p-8 text-center">
        <p className="font-heading text-2xl text-charcoal">Application received</p>
        <p className="mt-3 text-warm-text leading-relaxed">{SUCCESS_MESSAGE}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {!FORMSPREE_ENDPOINT && process.env.NODE_ENV === "development" && (
        <p className="border border-amber-600 bg-amber-50 px-4 py-3 text-sm text-amber-900 break-words">
          Developer note: NEXT_PUBLIC_FORMSPREE_CLEANER_APPLICATION_URL is not set, so this
          form cannot submit. Add it to .env.local (see .env.example).
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="cleaner-first-name" className={labelClasses}>
            First Name
          </label>
          <input
            id="cleaner-first-name"
            type="text"
            autoComplete="given-name"
            value={values.firstName}
            onChange={(event) => updateField("firstName", event.target.value)}
            aria-invalid={Boolean(errors.firstName)}
            aria-describedby={errors.firstName ? "cleaner-first-name-error" : undefined}
            className={inputClasses}
          />
          {errors.firstName && (
            <p id="cleaner-first-name-error" className={errorClasses}>
              {errors.firstName}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="cleaner-last-name" className={labelClasses}>
            Last Name
          </label>
          <input
            id="cleaner-last-name"
            type="text"
            autoComplete="family-name"
            value={values.lastName}
            onChange={(event) => updateField("lastName", event.target.value)}
            aria-invalid={Boolean(errors.lastName)}
            aria-describedby={errors.lastName ? "cleaner-last-name-error" : undefined}
            className={inputClasses}
          />
          {errors.lastName && (
            <p id="cleaner-last-name-error" className={errorClasses}>
              {errors.lastName}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="cleaner-email" className={labelClasses}>
            Email Address
          </label>
          <input
            id="cleaner-email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => updateField("email", event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "cleaner-email-error" : undefined}
            className={inputClasses}
          />
          {errors.email && (
            <p id="cleaner-email-error" className={errorClasses}>
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="cleaner-phone" className={labelClasses}>
            Phone Number
          </label>
          <input
            id="cleaner-phone"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "cleaner-phone-error" : undefined}
            className={inputClasses}
          />
          {errors.phone && (
            <p id="cleaner-phone-error" className={errorClasses}>
              {errors.phone}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="cleaner-city" className={labelClasses}>
          City or Neighborhood
        </label>
        <p className="mt-1 text-sm text-warm-text">Tell us where you are based.</p>
        <input
          id="cleaner-city"
          type="text"
          value={values.city}
          onChange={(event) => updateField("city", event.target.value)}
          aria-invalid={Boolean(errors.city)}
          aria-describedby={errors.city ? "cleaner-city-error" : undefined}
          className={inputClasses}
        />
        {errors.city && (
          <p id="cleaner-city-error" className={errorClasses}>
            {errors.city}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="cleaner-experience" className={labelClasses}>
          Cleaning Experience
        </label>
        <select
          id="cleaner-experience"
          value={values.experience}
          onChange={(event) => updateField("experience", event.target.value)}
          aria-invalid={Boolean(errors.experience)}
          aria-describedby={errors.experience ? "cleaner-experience-error" : undefined}
          className={inputClasses}
        >
          <option value="">Select one</option>
          {EXPERIENCE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {errors.experience && (
          <p id="cleaner-experience-error" className={errorClasses}>
            {errors.experience}
          </p>
        )}
      </div>

      <fieldset>
        <legend className={legendClasses}>
          Do You Own or Have Reliable Access to a Car?
        </legend>
        <div className="mt-2 flex gap-6">
          {["Yes", "No"].map((option) => (
            <label key={option} className={checkboxRowClasses}>
              <input
                type="radio"
                name="hasCar"
                value={option}
                checked={values.hasCar === option}
                onChange={() => updateField("hasCar", option)}
                className="h-4 w-4 accent-deep-green"
              />
              {option}
            </label>
          ))}
        </div>
        {errors.hasCar && <p className={errorClasses}>{errors.hasCar}</p>}
      </fieldset>

      <fieldset>
        <legend className={legendClasses}>
          Do You Own Your Own Cleaning Supplies and Equipment?
        </legend>
        <div className="mt-2 flex flex-col gap-2">
          {SUPPLIES_OPTIONS.map((option) => (
            <label key={option} className={checkboxRowClasses}>
              <input
                type="radio"
                name="hasSupplies"
                value={option}
                checked={values.hasSupplies === option}
                onChange={() => updateField("hasSupplies", option)}
                className="h-4 w-4 accent-deep-green"
              />
              {option}
            </label>
          ))}
        </div>
        {errors.hasSupplies && <p className={errorClasses}>{errors.hasSupplies}</p>}
      </fieldset>

      <fieldset>
        <legend className={legendClasses}>Where Are You Available to Work?</legend>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
          {WORK_AREA_OPTIONS.map((option) => (
            <label key={option} className={checkboxRowClasses}>
              <input
                type="checkbox"
                checked={values.workAreas.includes(option)}
                onChange={() => toggleListValue("workAreas", option)}
                className="h-4 w-4 accent-deep-green"
              />
              {option}
            </label>
          ))}
        </div>
        {errors.workAreas && <p className={errorClasses}>{errors.workAreas}</p>}

        {values.workAreas.includes("Other") && (
          <div className="mt-3">
            <label htmlFor="cleaner-other-area" className="text-sm text-charcoal">
              Please specify.
            </label>
            <input
              id="cleaner-other-area"
              type="text"
              value={values.otherWorkArea}
              onChange={(event) => updateField("otherWorkArea", event.target.value)}
              aria-invalid={Boolean(errors.otherWorkArea)}
              aria-describedby={errors.otherWorkArea ? "cleaner-other-area-error" : undefined}
              className={inputClasses}
            />
            {errors.otherWorkArea && (
              <p id="cleaner-other-area-error" className={errorClasses}>
                {errors.otherWorkArea}
              </p>
            )}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className={legendClasses}>What Days Are You Available?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DAY_OPTIONS.map((option) => (
            <label key={option} className={checkboxRowClasses}>
              <input
                type="checkbox"
                checked={values.availableDays.includes(option)}
                onChange={() => toggleListValue("availableDays", option)}
                className="h-4 w-4 accent-deep-green"
              />
              {option}
            </label>
          ))}
        </div>
        {errors.availableDays && <p className={errorClasses}>{errors.availableDays}</p>}
      </fieldset>

      <fieldset>
        <legend className={legendClasses}>General Time Availability</legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {TIME_OPTIONS.map((option) => (
            <label key={option} className={checkboxRowClasses}>
              <input
                type="checkbox"
                checked={values.timeAvailability.includes(option)}
                onChange={() => toggleListValue("timeAvailability", option)}
                className="h-4 w-4 accent-deep-green"
              />
              {option}
            </label>
          ))}
        </div>
        {errors.timeAvailability && <p className={errorClasses}>{errors.timeAvailability}</p>}
      </fieldset>

      <div>
        <label htmlFor="cleaner-about" className={labelClasses}>
          Tell Us About Yourself
        </label>
        <p className="mt-1 text-sm text-warm-text">
          Tell us about your cleaning experience, the types of homes you have cleaned, and
          what makes you dependable.
        </p>
        <textarea
          id="cleaner-about"
          rows={5}
          maxLength={ABOUT_MAX}
          value={values.aboutYourself}
          onChange={(event) => updateField("aboutYourself", event.target.value)}
          aria-invalid={Boolean(errors.aboutYourself)}
          aria-describedby={errors.aboutYourself ? "cleaner-about-error" : "cleaner-about-count"}
          className={inputClasses}
        />
        <p id="cleaner-about-count" className="mt-1 text-xs text-warm-text">
          {values.aboutYourself.trim().length} / {ABOUT_MIN} minimum characters
        </p>
        {errors.aboutYourself && (
          <p id="cleaner-about-error" className={errorClasses}>
            {errors.aboutYourself}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="cleaner-additional" className={labelClasses}>
          Additional Information <span className="font-normal text-warm-text">(optional)</span>
        </label>
        <p className="mt-1 text-sm text-warm-text">
          Share anything else you would like BeLa Cleaning to know.
        </p>
        <textarea
          id="cleaner-additional"
          rows={4}
          value={values.additionalInfo}
          onChange={(event) => updateField("additionalInfo", event.target.value)}
          className={inputClasses}
        />
      </div>

      <div className="space-y-4 border-t border-soft-gray pt-6">
        <div>
          <label className="flex items-start gap-3 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={values.confirmAccurate}
              onChange={(event) => updateField("confirmAccurate", event.target.checked)}
              aria-invalid={Boolean(errors.confirmAccurate)}
              aria-describedby={errors.confirmAccurate ? "cleaner-confirm-error" : undefined}
              className="mt-1 h-4 w-4 accent-deep-green"
            />
            <span>
              I confirm that the information provided is accurate and understand that
              submitting this form does not guarantee cleaning assignments or a position
              with BeLa Cleaning.
            </span>
          </label>
          {errors.confirmAccurate && (
            <p id="cleaner-confirm-error" className={`${errorClasses} ml-7`}>
              {errors.confirmAccurate}
            </p>
          )}
        </div>

        <div>
          <label className="flex items-start gap-3 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={values.privacyAck}
              onChange={(event) => updateField("privacyAck", event.target.checked)}
              aria-invalid={Boolean(errors.privacyAck)}
              aria-describedby={errors.privacyAck ? "cleaner-privacy-error" : undefined}
              className="mt-1 h-4 w-4 accent-deep-green"
            />
            <span>
              I acknowledge that I have read the{" "}
              <Link href="/privacy" className="text-deep-green underline underline-offset-2">
                Privacy Policy
              </Link>{" "}
              and understand that BeLa Cleaning will use my information to review and
              communicate about possible cleaning opportunities.
            </span>
          </label>
          {errors.privacyAck && (
            <p id="cleaner-privacy-error" className={`${errorClasses} ml-7`}>
              {errors.privacyAck}
            </p>
          )}
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex items-center justify-center rounded-full bg-deep-green px-7 py-3.5 text-sm font-medium tracking-wide text-pure-white transition-colors duration-200 hover:bg-charcoal disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "submitting" ? "Submitting Application…" : "Submit Application"}
        </button>

        {status === "error" && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {ERROR_MESSAGE}
          </p>
        )}
      </div>
    </form>
  );
}

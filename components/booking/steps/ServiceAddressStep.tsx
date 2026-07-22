"use client";

import { useState } from "react";
import { US_STATES } from "@/lib/booking/config";
import { isValidZipFormat, isZipSupported } from "@/lib/booking/serviceArea";
import { isNonEmpty } from "@/lib/booking/validation";
import StepShell from "@/components/booking/StepShell";

type ServiceAddressStepProps = {
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  onStreetChange: (value: string) => void;
  onUnitChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onZipChange: (value: string) => void;
  onContinue: () => void;
  onBack: () => void;
};

const inputClasses =
  "mt-1.5 w-full rounded-lg border bg-white px-4 py-3 text-[#3B2F27] outline-none transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27]";

export default function ServiceAddressStep({
  street,
  unit,
  city,
  state,
  zip,
  onStreetChange,
  onUnitChange,
  onCityChange,
  onStateChange,
  onZipChange,
  onContinue,
  onBack,
}: ServiceAddressStepProps) {
  const [touched, setTouched] = useState(false);

  const trimmedZip = zip.trim();
  const zipFormatValid = isValidZipFormat(trimmedZip);
  const zipSupported = zipFormatValid && isZipSupported(trimmedZip);
  const zipRevalidationFailed = zipFormatValid && !zipSupported;

  const valid = isNonEmpty(street) && isNonEmpty(city) && isNonEmpty(state) && zipFormatValid && zipSupported;

  const handleZipInput = (value: string) => {
    onZipChange(value.replace(/\D/g, "").slice(0, 5));
  };

  return (
    <StepShell question="Where should the crew go?" note="This is the address we'll clean." onBack={onBack}>
      <div className="max-w-md space-y-5">
        <div>
          <label htmlFor="address-street" className="text-sm font-medium text-[#3B2F27]">
            Street address
          </label>
          <input
            id="address-street"
            type="text"
            autoComplete="address-line1"
            value={street}
            onChange={(event) => onStreetChange(event.target.value)}
            onBlur={() => setTouched(true)}
            className={`${inputClasses} ${touched && !isNonEmpty(street) ? "border-red-300" : "border-[#E7DECE] focus:border-[#3B2F27]"}`}
          />
          {touched && !isNonEmpty(street) && <p className="mt-1.5 text-sm text-red-700">Street address is required.</p>}
        </div>

        <div>
          <label htmlFor="address-unit" className="text-sm font-medium text-[#3B2F27]">
            Apartment or unit <span className="font-normal text-[#A9998A]">(optional)</span>
          </label>
          <input
            id="address-unit"
            type="text"
            autoComplete="address-line2"
            value={unit}
            onChange={(event) => onUnitChange(event.target.value)}
            className={`${inputClasses} border-[#E7DECE] focus:border-[#3B2F27]`}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="address-city" className="text-sm font-medium text-[#3B2F27]">
              City
            </label>
            <input
              id="address-city"
              type="text"
              autoComplete="address-level2"
              value={city}
              onChange={(event) => onCityChange(event.target.value)}
              onBlur={() => setTouched(true)}
              className={`${inputClasses} ${touched && !isNonEmpty(city) ? "border-red-300" : "border-[#E7DECE] focus:border-[#3B2F27]"}`}
            />
            {touched && !isNonEmpty(city) && <p className="mt-1.5 text-sm text-red-700">City is required.</p>}
          </div>

          <div>
            <label htmlFor="address-state" className="text-sm font-medium text-[#3B2F27]">
              State
            </label>
            <select
              id="address-state"
              autoComplete="address-level1"
              value={state}
              onChange={(event) => onStateChange(event.target.value)}
              className={`${inputClasses} border-[#E7DECE] focus:border-[#3B2F27]`}
            >
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="address-zip" className="text-sm font-medium text-[#3B2F27]">
            ZIP code
          </label>
          <input
            id="address-zip"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            value={zip}
            onChange={(event) => handleZipInput(event.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && (!zipFormatValid || zipRevalidationFailed)}
            className={`${inputClasses} max-w-[10rem] tracking-widest ${
              touched && (!zipFormatValid || zipRevalidationFailed) ? "border-red-300" : "border-[#E7DECE] focus:border-[#3B2F27]"
            }`}
          />
          {touched && !zipFormatValid && trimmedZip.length > 0 && (
            <p className="mt-1.5 text-sm text-red-700">Please enter a valid 5-digit ZIP code.</p>
          )}
          {zipRevalidationFailed && (
            <p className="mt-1.5 text-sm text-red-700">
              This ZIP code is outside our current instant-booking area. Please update it, or go back to the
              location step to send us a message instead.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setTouched(true);
            if (valid) onContinue();
          }}
          disabled={touched && !valid}
          className="mt-2 inline-flex items-center justify-center rounded-full bg-[#3B2F27] px-8 py-3.5 text-sm font-medium tracking-wide text-white transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:bg-[#2A211C] hover:shadow-[0_16px_28px_-10px_rgba(59,47,39,0.35)] active:translate-y-0 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          Continue
        </button>
      </div>
    </StepShell>
  );
}

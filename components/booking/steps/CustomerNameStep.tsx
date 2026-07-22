"use client";

import { useState } from "react";
import { isNonEmpty } from "@/lib/booking/validation";
import StepShell from "@/components/booking/StepShell";

type CustomerNameStepProps = {
  firstName: string;
  lastName: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onContinue: () => void;
  onBack: () => void;
};

// Client-side prototype state only — nothing here is stored or
// transmitted. Server-side validation of these fields will be required
// once a real submission endpoint exists; this check exists only to keep
// the guided flow moving.
export default function CustomerNameStep({
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
  onContinue,
  onBack,
}: CustomerNameStepProps) {
  const [touched, setTouched] = useState(false);
  const valid = isNonEmpty(firstName) && isNonEmpty(lastName);

  return (
    <StepShell question="What should we call you?" onBack={onBack}>
      <div className="max-w-sm space-y-5">
        <div>
          <label htmlFor="first-name" className="text-sm font-medium text-[#3B2F27]">
            First name
          </label>
          <input
            id="first-name"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => onFirstNameChange(event.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !isNonEmpty(firstName)}
            className={`mt-1.5 w-full rounded-lg border bg-white px-4 py-3 text-[#3B2F27] outline-none transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27] ${
              touched && !isNonEmpty(firstName) ? "border-red-300" : "border-[#E7DECE] focus:border-[#3B2F27]"
            }`}
          />
          {touched && !isNonEmpty(firstName) && <p className="mt-1.5 text-sm text-red-700">First name is required.</p>}
        </div>

        <div>
          <label htmlFor="last-name" className="text-sm font-medium text-[#3B2F27]">
            Last name
          </label>
          <input
            id="last-name"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => onLastNameChange(event.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !isNonEmpty(lastName)}
            className={`mt-1.5 w-full rounded-lg border bg-white px-4 py-3 text-[#3B2F27] outline-none transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27] ${
              touched && !isNonEmpty(lastName) ? "border-red-300" : "border-[#E7DECE] focus:border-[#3B2F27]"
            }`}
          />
          {touched && !isNonEmpty(lastName) && <p className="mt-1.5 text-sm text-red-700">Last name is required.</p>}
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

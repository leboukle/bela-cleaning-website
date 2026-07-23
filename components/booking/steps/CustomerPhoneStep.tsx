"use client";

import { useState } from "react";
import { isValidUsPhone } from "@/lib/booking/validation";
import StepShell from "@/components/booking/StepShell";

type CustomerPhoneStepProps = {
  phone: string;
  onChange: (value: string) => void;
  onContinue: () => void;
  onBack: () => void;
};

// Client-side prototype state only — nothing here is stored or
// transmitted. Server-side validation will be required later.
export default function CustomerPhoneStep({ phone, onChange, onContinue, onBack }: CustomerPhoneStepProps) {
  const [touched, setTouched] = useState(false);
  const valid = isValidUsPhone(phone);

  return (
    <StepShell
      question="What's the best mobile number for appointment updates?"
      note="We'll text you before your cleaner arrives, and use this number only for appointment updates."
      onBack={onBack}
    >
      <div className="max-w-sm">
        <label htmlFor="customer-phone" className="text-sm font-medium text-[#3B2F27]">
          Mobile phone number
        </label>
        <input
          id="customer-phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={phone}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="(555) 123-4567"
          aria-invalid={touched && !valid}
          aria-describedby={touched && !valid ? "customer-phone-error" : undefined}
          className={`mt-1.5 w-full rounded-lg border bg-white px-4 py-3 text-[#3B2F27] outline-none transition-colors duration-150 placeholder:text-[#D9CCB8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27] ${
            touched && !valid ? "border-red-300" : "border-[#E7DECE] focus:border-[#3B2F27]"
          }`}
        />
        {touched && !valid && (
          <p id="customer-phone-error" className="mt-1.5 text-sm text-red-700">
            Please enter a valid 10-digit US mobile number.
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setTouched(true);
            if (valid) onContinue();
          }}
          disabled={touched && !valid}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-[#3B2F27] px-8 py-3.5 text-sm font-medium tracking-wide text-white transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:bg-[#2A211C] hover:shadow-[0_16px_28px_-10px_rgba(59,47,39,0.35)] active:translate-y-0 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          Continue
        </button>
      </div>
    </StepShell>
  );
}

"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { EXAMPLE_SUPPORTED_ZIP, getCityForZip, isValidZipFormat, isZipSupported } from "@/lib/booking/serviceArea";
import { businessConfig } from "@/lib/config";
import StepShell from "@/components/booking/StepShell";

type LocationStepProps = {
  zipCode: string;
  onZipChange: (zip: string) => void;
  outOfAreaMessage: string;
  onOutOfAreaMessageChange: (text: string) => void;
  onContinue: () => void;
  onBack: () => void;
};

export default function LocationStep({
  zipCode,
  onZipChange,
  outOfAreaMessage,
  onOutOfAreaMessageChange,
  onContinue,
  onBack,
}: LocationStepProps) {
  const [touched, setTouched] = useState(false);

  const trimmedZip = zipCode.trim();
  const formatValid = trimmedZip.length > 0 && isValidZipFormat(trimmedZip);
  const supported = formatValid && isZipSupported(trimmedZip);
  const showFormatError = touched && trimmedZip.length > 0 && !formatValid;

  const handleZipInput = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 5);
    onZipChange(digitsOnly);
  };

  const outOfAreaMailBody = [
    "Hi BeLa Cleaning team,",
    "",
    `I'm outside your instant-booking area (ZIP ${trimmedZip}) and would like to know if you can help.`,
    "",
    outOfAreaMessage.trim() ? `Details: ${outOfAreaMessage.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const outOfAreaMailtoHref = `mailto:${businessConfig.email}?subject=${encodeURIComponent("Service Area Inquiry")}&body=${encodeURIComponent(outOfAreaMailBody)}`;

  return (
    <StepShell
      question="Where would you like us to clean?"
      note="Just your ZIP code for now — we'll confirm the property is within our current service area."
      onBack={onBack}
    >
      <div className="max-w-xs">
        <label htmlFor="location-zip" className="text-sm font-medium text-[#3B2F27]">
          ZIP code
        </label>
        <input
          id="location-zip"
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          value={zipCode}
          onChange={(event) => handleZipInput(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={EXAMPLE_SUPPORTED_ZIP}
          aria-invalid={showFormatError}
          aria-describedby={showFormatError ? "location-zip-error" : undefined}
          className={`mt-1.5 w-full rounded-lg border bg-white px-4 py-3 text-lg tracking-widest text-[#3B2F27] outline-none transition-colors duration-150 placeholder:text-[#D9CCB8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27] ${
            showFormatError ? "border-red-300" : "border-[#E7DECE] focus:border-[#3B2F27]"
          }`}
        />
        {showFormatError && (
          <p id="location-zip-error" className="mt-2 text-sm text-red-700">
            Please enter a valid 5-digit ZIP code.
          </p>
        )}
      </div>

      {formatValid && supported && (
        <div className="mt-6 max-w-md animate-[booking-step-in_0.3s_ease-out] rounded-2xl border border-[#C9BCA6] bg-[#F1E9DC] p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3B2F27] text-white">
              <Check size={14} strokeWidth={3} aria-hidden="true" />
            </span>
            <div>
              <p className="font-heading text-lg text-[#3B2F27]">Great news — we serve your area.</p>
              {getCityForZip(trimmedZip) && (
                <p className="mt-1 text-sm text-[#6B5B4C]">{getCityForZip(trimmedZip)}, NJ</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onContinue}
            className="mt-5 inline-flex items-center justify-center rounded-full bg-[#3B2F27] px-8 py-3.5 text-sm font-medium tracking-wide text-white transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:bg-[#2A211C] hover:shadow-[0_16px_28px_-10px_rgba(59,47,39,0.35)] active:translate-y-0 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
          >
            Continue
          </button>
        </div>
      )}

      {formatValid && !supported && (
        <div className="mt-6 max-w-md animate-[booking-step-in_0.3s_ease-out] rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_4px_24px_-8px_rgba(59,47,39,0.12)] sm:p-7">
          <p className="font-heading text-xl leading-snug text-[#3B2F27]">
            This address falls just outside our instant-booking area — but that doesn&rsquo;t mean we
            can&rsquo;t help.
          </p>
          <p className="mt-2 text-sm text-[#6B5B4C]">
            Send us a quick note below and our team will follow up personally to see what we can do.
          </p>

          <div className="mt-5">
            <label htmlFor="out-of-area-message" className="text-sm font-medium text-[#3B2F27]">
              Message (optional)
            </label>
            <textarea
              id="out-of-area-message"
              rows={3}
              value={outOfAreaMessage}
              onChange={(event) => onOutOfAreaMessageChange(event.target.value)}
              placeholder="Tell us a bit about your property and preferred timing..."
              className="mt-1.5 w-full rounded-lg border border-[#E7DECE] bg-white px-4 py-3 text-[#3B2F27] outline-none transition-colors duration-150 placeholder:text-[#A9998A] focus:border-[#3B2F27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27]"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            <a
              href={outOfAreaMailtoHref}
              className="inline-flex items-center justify-center rounded-full bg-[#3B2F27] px-8 py-3.5 text-sm font-medium tracking-wide text-white transition-colors duration-150 hover:bg-[#2A211C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
            >
              Contact BeLa Cleaning
            </a>
          </div>
          <p className="mt-3 text-xs text-[#A9998A]">
            Opens your email app so our team can follow up. You can also call us at{" "}
            {businessConfig.phoneDisplay}.
          </p>
        </div>
      )}
    </StepShell>
  );
}

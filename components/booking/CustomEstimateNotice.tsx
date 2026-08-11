"use client";

import { businessConfig } from "@/lib/config";

type CustomEstimateNoticeProps = {
  message: string;
  notes: string;
  onNotesChange: (value: string) => void;
  onBack: () => void;
};

// Shown whenever a selection (square footage, bedroom count, or bathroom
// count) exceeds what instant pricing can handle. Stops the instant-booking
// flow rather than guessing at a number. "Request a Custom Estimate" opens
// the customer's email client, prefilled and addressed to BeLa directly —
// the simplest way to route this request to a real human without building
// a separate lead-intake system.
export default function CustomEstimateNotice({ message, notes, onNotesChange, onBack }: CustomEstimateNoticeProps) {
  const mailBody = [
    "Hi BeLa Cleaning team,",
    "",
    "I'd like to request a custom cleaning estimate for my home.",
    "",
    notes.trim() ? `Details: ${notes.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const mailtoHref = `mailto:${businessConfig.email}?subject=${encodeURIComponent("Custom Cleaning Estimate Request")}&body=${encodeURIComponent(mailBody)}`;

  return (
    <div className="rounded-2xl border border-[#E7DECE] bg-white p-7 shadow-[0_4px_24px_-8px_rgba(59,47,39,0.12)] sm:p-9">
      <p className="font-heading text-2xl leading-snug text-[#3B2F27] sm:text-[1.75rem]">{message}</p>

      <div className="mt-7">
        <label htmlFor="custom-estimate-notes" className="text-sm font-medium text-[#3B2F27]">
          Tell us about the property (optional)
        </label>
        <textarea
          id="custom-estimate-notes"
          rows={4}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Number of bedrooms and bathrooms, general condition, anything else that would help us prepare an estimate..."
          className="mt-1.5 w-full rounded-lg border border-[#E7DECE] bg-white px-4 py-3 text-[#3B2F27] outline-none transition-colors duration-150 placeholder:text-[#A9998A] focus:border-[#3B2F27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27]"
        />
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-5">
        <a
          href={mailtoHref}
          className="inline-flex items-center justify-center rounded-full bg-[#3B2F27] px-8 py-3.5 text-sm font-medium tracking-wide text-white transition-colors duration-150 hover:bg-[#2A211C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
        >
          Request a Custom Estimate
        </a>
        <button
          type="button"
          onClick={onBack}
          className="rounded text-sm font-medium text-[#3B2F27] underline underline-offset-2 transition-colors duration-150 hover:text-[#6B5B4C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
        >
          Change your answer
        </button>
      </div>
      <p className="mt-3 text-xs text-[#A9998A]">
        Opens your email app so we can prepare a custom estimate for you. You can also call us at{" "}
        {businessConfig.phoneDisplay}.
      </p>
    </div>
  );
}

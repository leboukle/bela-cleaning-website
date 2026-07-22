"use client";

type CustomEstimateNoticeProps = {
  message: string;
  notes: string;
  onNotesChange: (value: string) => void;
  onBack: () => void;
};

// Shown whenever a selection (square footage, bedroom count, or bathroom
// count) exceeds what this prototype can instantly price. Stops the
// instant-booking flow rather than guessing at a number. The "Request a
// Custom Estimate" action is intentionally non-functional in this
// milestone — see the DEVELOPER NOTE below.
export default function CustomEstimateNotice({ message, notes, onNotesChange, onBack }: CustomEstimateNoticeProps) {
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

      {/*
        DEVELOPER NOTE: This button is intentionally disabled for Milestone
        1. Wiring it up to actually send a request (email, CRM lead, etc.)
        is out of scope for this prototype — see the milestone report for
        details. Do not remove the `disabled` attribute without also
        building real submission handling.
      */}
      <div className="mt-7 flex flex-wrap items-center gap-5">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex cursor-not-allowed items-center justify-center rounded-full bg-[#3B2F27] px-8 py-3.5 text-sm font-medium tracking-wide text-white opacity-50"
        >
          Request a Custom Estimate
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded text-sm font-medium text-[#3B2F27] underline underline-offset-2 transition-colors duration-150 hover:text-[#6B5B4C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
        >
          Change your answer
        </button>
      </div>
      <p className="mt-3 text-xs text-[#A9998A]">
        Prototype only — this button does not send a request yet.
      </p>
    </div>
  );
}

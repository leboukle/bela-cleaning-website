"use client";

import StepShell from "@/components/booking/StepShell";

const MAX_LENGTH = 500;

type SpecialInstructionsStepProps = {
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
  onBack: () => void;
};

export default function SpecialInstructionsStep({ value, onChange, onContinue, onBack }: SpecialInstructionsStepProps) {
  return (
    <StepShell
      question="Is there anything else you'd like us to know?"
      note="Pets, preferred supplies, parking, entry arrangements, priority rooms — anything that will help us prepare. Optional."
      onBack={onBack}
    >
      <div className="max-w-xl">
        <label htmlFor="special-instructions" className="sr-only">
          Special instructions
        </label>
        <textarea
          id="special-instructions"
          rows={6}
          maxLength={MAX_LENGTH}
          value={value}
          onChange={(event) => onChange(event.target.value.slice(0, MAX_LENGTH))}
          placeholder="e.g. Friendly dog will be in the backyard, please use the side entrance, focus on the kitchen and primary bathroom..."
          className="w-full rounded-lg border border-[#E7DECE] bg-white px-4 py-3 text-[#3B2F27] outline-none transition-colors duration-150 placeholder:text-[#A9998A] focus:border-[#3B2F27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27]"
        />
        <p className="mt-1.5 text-right text-xs text-[#A9998A]" aria-live="polite">
          {value.length}/{MAX_LENGTH}
        </p>

        <button
          type="button"
          onClick={onContinue}
          className="mt-4 inline-flex items-center justify-center rounded-full bg-[#3B2F27] px-8 py-3.5 text-sm font-medium tracking-wide text-white transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:bg-[#2A211C] hover:shadow-[0_16px_28px_-10px_rgba(59,47,39,0.35)] active:translate-y-0 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
        >
          Continue
        </button>
      </div>
    </StepShell>
  );
}

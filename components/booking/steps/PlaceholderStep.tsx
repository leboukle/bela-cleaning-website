"use client";

import StepShell from "@/components/booking/StepShell";

type PlaceholderStepProps = {
  question: string;
  description: string;
  continueLabel?: string;
  onContinue?: () => void;
  onBack: () => void;
};

// Used for Schedule, Details, and Review — stages that will connect to real
// scheduling, contact capture, and payment in a later milestone. Nothing
// here collects or saves any personal information.
export default function PlaceholderStep({
  question,
  description,
  continueLabel,
  onContinue,
  onBack,
}: PlaceholderStepProps) {
  return (
    <StepShell question={question} onBack={onBack}>
      <div className="rounded-xl border-2 border-dashed border-[#D9CCB8] bg-[#FBF7EF] p-6 sm:p-8">
        <span className="inline-block rounded-full bg-[#EFE7DA] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#8A7A6B]">
          Coming in a later milestone
        </span>
        <p className="mt-4 text-base text-[#6B5B4C] leading-relaxed">{description}</p>
        {onContinue && continueLabel && (
          <button
            type="button"
            onClick={onContinue}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-[#3B2F27] px-7 py-3.5 text-sm font-medium tracking-wide text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2A211C] hover:shadow-lg active:translate-y-0 active:scale-[0.97]"
          >
            {continueLabel}
          </button>
        )}
      </div>
    </StepShell>
  );
}

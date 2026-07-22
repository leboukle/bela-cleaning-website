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
      <div className="rounded-2xl border border-dashed border-[#D9CCB8] bg-[#FBF7EF] p-7 sm:p-9">
        <span className="inline-block rounded-full bg-[#EFE7DA] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#8A7A6B]">
          Coming in a later milestone
        </span>
        <p className="mt-4 text-base text-[#6B5B4C] leading-relaxed">{description}</p>
        {onContinue && continueLabel && (
          <button
            type="button"
            onClick={onContinue}
            className="mt-7 inline-flex items-center justify-center rounded-full bg-[#3B2F27] px-8 py-3.5 text-sm font-medium tracking-wide text-white transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:bg-[#2A211C] hover:shadow-[0_16px_28px_-10px_rgba(59,47,39,0.35)] active:translate-y-0 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
          >
            {continueLabel}
          </button>
        )}
      </div>
    </StepShell>
  );
}

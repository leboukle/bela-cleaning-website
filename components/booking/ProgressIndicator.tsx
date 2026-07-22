"use client";

import { Check } from "lucide-react";
import { PROGRESS_STAGES } from "@/lib/booking/config";

type ProgressIndicatorProps = {
  currentStage: string | undefined;
};

// Desktop: a labeled stepper where completed stages resolve into a filled
// checkmark (a small reward for progress), the current stage gets a soft
// glow so it's unmistakable, and future stages stay quiet and understated.
// Mobile: a row of segmented pills (an Instagram-story-style pattern that
// reads clearly at a glance on small screens) plus a compact text label.
export default function ProgressIndicator({ currentStage }: ProgressIndicatorProps) {
  const currentIndex = currentStage ? PROGRESS_STAGES.indexOf(currentStage as (typeof PROGRESS_STAGES)[number]) : -1;

  return (
    <nav aria-label="Booking progress" className="mb-10">
      {/* Desktop: full labeled stepper */}
      <ol className="hidden items-start gap-2 lg:flex">
        {PROGRESS_STAGES.map((stage, index) => {
          const isComplete = currentIndex > index;
          const isCurrent = currentIndex === index;
          return (
            <li key={stage} className="flex flex-1 flex-col last:flex-none">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
                    isCurrent
                      ? "bg-[#3B2F27] text-white shadow-[0_0_0_5px_rgba(59,47,39,0.12)]"
                      : isComplete
                        ? "bg-[#3B2F27] text-white"
                        : "border border-[#E7DECE] bg-white text-[#B9AC9B]"
                  }`}
                  aria-hidden="true"
                >
                  {isComplete ? <Check size={14} strokeWidth={3} /> : index + 1}
                </span>
                {index < PROGRESS_STAGES.length - 1 && (
                  <span className="relative h-px flex-1 overflow-hidden rounded-full bg-[#E7DECE]" aria-hidden="true">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-[#3B2F27] transition-[width] duration-500 ease-out"
                      style={{ width: isComplete ? "100%" : "0%" }}
                    />
                  </span>
                )}
              </div>
              <span
                className={`mt-2 text-xs font-medium uppercase tracking-wide transition-colors duration-300 ${
                  isCurrent ? "text-[#3B2F27]" : isComplete ? "text-[#8A7A6B]" : "text-[#B9AC9B]"
                }`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {stage}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Mobile: segmented progress pills + compact label */}
      <div className="lg:hidden">
        <div className="flex gap-1.5" role="presentation">
          {PROGRESS_STAGES.map((stage, index) => (
            <span
              key={stage}
              aria-hidden="true"
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                index <= currentIndex ? "bg-[#3B2F27]" : "bg-[#EFE7DA]"
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-[#8A7A6B]">
          Step {Math.max(currentIndex + 1, 1)} of {PROGRESS_STAGES.length}
          {currentStage ? ` — ${currentStage}` : ""}
        </p>
      </div>
    </nav>
  );
}

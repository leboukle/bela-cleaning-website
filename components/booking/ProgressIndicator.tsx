"use client";

import { PROGRESS_STAGES } from "@/lib/booking/config";

type ProgressIndicatorProps = {
  currentStage: string | undefined;
};

export default function ProgressIndicator({ currentStage }: ProgressIndicatorProps) {
  const currentIndex = currentStage ? PROGRESS_STAGES.indexOf(currentStage as (typeof PROGRESS_STAGES)[number]) : -1;

  return (
    <nav aria-label="Booking progress" className="mb-8">
      {/* Desktop: full labeled stepper */}
      <ol className="hidden items-center gap-2 lg:flex">
        {PROGRESS_STAGES.map((stage, index) => {
          const isComplete = currentIndex > index;
          const isCurrent = currentIndex === index;
          return (
            <li key={stage} className="flex flex-1 items-center gap-2 last:flex-none">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300 ${
                    isCurrent
                      ? "bg-[#3B2F27] text-white"
                      : isComplete
                        ? "bg-[#C9BCA6] text-white"
                        : "bg-[#EFE7DA] text-[#8A7A6B]"
                  }`}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span
                  className={`text-xs font-medium uppercase tracking-wide transition-colors duration-300 ${
                    isCurrent ? "text-[#3B2F27]" : "text-[#A9998A]"
                  }`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {stage}
                </span>
              </div>
              {index < PROGRESS_STAGES.length - 1 && (
                <span
                  className={`h-px flex-1 transition-colors duration-300 ${isComplete ? "bg-[#C9BCA6]" : "bg-[#E7DECE]"}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile: condensed step label + thin bar */}
      <div className="lg:hidden">
        <p className="text-xs font-medium uppercase tracking-wide text-[#8A7A6B]">
          Step {Math.max(currentIndex + 1, 1)} of {PROGRESS_STAGES.length}
          {currentStage ? ` — ${currentStage}` : ""}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#EFE7DA]">
          <div
            className="h-full rounded-full bg-[#3B2F27] transition-[width] duration-300 ease-out"
            style={{
              width: `${Math.max(((currentIndex + 1) / PROGRESS_STAGES.length) * 100, 100 / PROGRESS_STAGES.length)}%`,
            }}
          />
        </div>
      </div>
    </nav>
  );
}

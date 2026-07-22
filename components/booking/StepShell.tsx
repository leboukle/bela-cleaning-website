"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type StepShellProps = {
  question: string;
  note?: string;
  onBack?: () => void;
  children: ReactNode;
};

// Shared heading/back-button scaffold every question step renders inside.
// Keeping this separate from BookingFlow's transition wrapper means each
// step file only has to describe its own question and options.
export default function StepShell({ question, note, onBack, children }: StepShellProps) {
  return (
    <div>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="group mb-5 inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-[#8A7A6B] transition-colors duration-150 hover:text-[#3B2F27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
        >
          <ArrowLeft
            size={16}
            aria-hidden="true"
            className="transition-transform duration-150 group-hover:-translate-x-0.5"
          />
          Back
        </button>
      )}
      <h1 className="font-heading text-[1.75rem] leading-[1.15] text-[#3B2F27] text-balance sm:text-4xl">
        {question}
      </h1>
      {note && <p className="mt-2.5 text-[15px] text-[#8A7A6B] leading-relaxed">{note}</p>}
      <div className="mt-7">{children}</div>
    </div>
  );
}

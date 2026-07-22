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
          className="group mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#8A7A6B] transition-colors duration-150 hover:text-[#3B2F27]"
        >
          <ArrowLeft
            size={16}
            aria-hidden="true"
            className="transition-transform duration-150 group-hover:-translate-x-0.5"
          />
          Back
        </button>
      )}
      <h1 className="font-heading text-2xl sm:text-3xl text-[#3B2F27] text-balance">{question}</h1>
      {note && <p className="mt-2 text-sm text-[#8A7A6B] leading-relaxed">{note}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

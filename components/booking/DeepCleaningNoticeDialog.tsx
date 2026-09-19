"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { formatCurrency } from "@/lib/booking/calculate";
import { getCleaningTypeOption } from "@/lib/booking/config";

type DeepCleaningNoticeDialogProps = {
  onSwitchToDeep: () => void;
  onKeepStandard: () => void;
  /** Closes the dialog with NO choice made — must not be treated as keeping Standard. */
  onDismiss: () => void;
};

// The "+$100" is derived from the same centralized cleaning-type pricing
// the estimate itself uses, never a second hard-coded figure.
const DEEP_SURCHARGE =
  getCleaningTypeOption("deep").priceAdd - getCleaningTypeOption("standard").priceAdd;

const FOCUSABLE = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

// Shown when a Standard Cleaning booking's notes ask for deep-cleaning work
// (see lib/booking/notesSafeguard.ts). Two explicit choices; the close
// button, Escape, and a backdrop click all just dismiss without choosing.
export default function DeepCleaningNoticeDialog({ onSwitchToDeep, onKeepStandard, onDismiss }: DeepCleaningNoticeDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(42,33,28,0.55)] p-4"
      onClick={onDismiss}
      data-testid="deep-cleaning-notice-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="deep-cleaning-notice-title"
        aria-describedby="deep-cleaning-notice-body"
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-lg rounded-2xl border border-[#E7DECE] bg-white p-7 shadow-[0_24px_64px_-16px_rgba(59,47,39,0.45)] sm:p-9"
      >
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-[#8A7A6B] transition-colors duration-150 hover:bg-[#F5EFE4] hover:text-[#3B2F27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27]"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <h2 id="deep-cleaning-notice-title" className="pr-8 font-heading text-2xl leading-snug text-[#3B2F27]">
          Your notes may require a Deep Cleaning
        </h2>

        <div id="deep-cleaning-notice-body" className="mt-4 space-y-3 text-[15px] text-[#6B5B4C]">
          <p>
            You selected Standard Cleaning, which is designed for routine upkeep in a home that&rsquo;s already in good
            shape. Your notes mention deep-cleaning needs.
          </p>
          <p className="font-medium text-[#3B2F27]">Would you like to update your service?</p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button
            ref={primaryRef}
            type="button"
            onClick={onSwitchToDeep}
            className="inline-flex w-full items-center justify-center rounded-full bg-[#3B2F27] px-6 py-3.5 text-sm font-medium tracking-wide text-white transition-colors duration-150 hover:bg-[#2A211C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
          >
            Switch to Deep Cleaning (+{formatCurrency(DEEP_SURCHARGE)})
          </button>
          <button
            type="button"
            onClick={onKeepStandard}
            className="inline-flex w-full items-center justify-center rounded-full border border-[#C9BCA6] bg-white px-6 py-3.5 text-sm font-medium tracking-wide text-[#3B2F27] transition-colors duration-150 hover:bg-[#F5EFE4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
          >
            Keep Standard Cleaning
          </button>
        </div>

        <p className="mt-5 text-xs text-[#8A7A6B]">
          Requests outside the scope of Standard Cleaning may not be completed during your appointment.
        </p>
      </div>
    </div>
  );
}

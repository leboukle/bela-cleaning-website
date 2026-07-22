"use client";

import { useState } from "react";
import { ChevronUp } from "lucide-react";
import { formatCurrency, formatDuration, type EstimateBreakdown } from "@/lib/booking/calculate";
import { getSummaryLines } from "@/lib/booking/summary";
import type { BookingState } from "@/lib/booking/types";

type MobileSummaryBarProps = {
  state: BookingState;
  estimate: EstimateBreakdown | null;
};

// Sticky bottom bar shown only on mobile. Tapping it expands/collapses the
// same selection details the desktop sidebar shows.
export default function MobileSummaryBar({ state, estimate }: MobileSummaryBarProps) {
  const [expanded, setExpanded] = useState(false);
  const lines = getSummaryLines(state);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-[#E7DECE] bg-white lg:hidden">
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0">
          <div className="max-h-[45vh] overflow-y-auto border-b border-[#EFE7DA] px-5 py-4">
            <h2 className="font-heading text-base text-[#3B2F27]">Your Cleaning</h2>
            {lines.length === 0 ? (
              <p className="mt-2 text-sm text-[#A9998A]">Your selections will appear here as you go.</p>
            ) : (
              <dl className="mt-3 space-y-2">
                {lines.map((line) => (
                  <div key={line.label} className="flex justify-between gap-4 text-sm">
                    <dt className="text-[#A9998A]">{line.label}</dt>
                    <dd className="text-right font-medium text-[#3B2F27]">{line.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-5 py-4 transition-colors duration-150 active:bg-[#FBF7EF]"
      >
        <span className="text-left">
          <span className="block text-xs uppercase tracking-wide text-[#A9998A]">Estimated total</span>
          <span
            key={estimate ? estimate.totalPrice : "custom"}
            className="inline-block animate-[booking-value-pop_0.25s_ease-out] font-heading text-lg text-[#3B2F27]"
          >
            {estimate ? formatCurrency(estimate.totalPrice) : "Custom estimate"}
            <span className="ml-2 text-sm font-sans font-medium text-[#8A7A6B]">
              {estimate ? formatDuration(estimate.totalDurationMinutes) : "—"}
            </span>
          </span>
        </span>
        <ChevronUp
          size={20}
          className={`shrink-0 text-[#3B2F27] transition-transform duration-300 ease-out ${expanded ? "" : "rotate-180"}`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

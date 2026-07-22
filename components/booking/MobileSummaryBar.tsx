"use client";

import { useState } from "react";
import { ChevronUp, Clock } from "lucide-react";
import { formatCurrency, formatDuration, type EstimateBreakdown } from "@/lib/booking/calculate";
import { getSummaryLines } from "@/lib/booking/summary";
import type { BookingState } from "@/lib/booking/types";
import { usePulseClass } from "@/components/booking/usePulseClass";

const PULSE = "animate-[booking-value-pop_0.25s_ease-out]";

type MobileSummaryBarProps = {
  state: BookingState;
  estimate: EstimateBreakdown | null;
};

// Sticky bottom bar shown only on mobile. Tapping it expands/collapses the
// same selection details the desktop sidebar shows. `env(safe-area-inset-bottom)`
// keeps the bar clear of the home indicator on notched phones.
export default function MobileSummaryBar({ state, estimate }: MobileSummaryBarProps) {
  const [expanded, setExpanded] = useState(false);
  const lines = getSummaryLines(state);
  const totalPulse = usePulseClass(estimate ? estimate.totalPrice : "custom", PULSE);
  const durationPulse = usePulseClass(estimate ? estimate.totalDurationMinutes : "custom-duration", PULSE);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E7DECE] bg-white/95 shadow-[0_-8px_24px_-12px_rgba(59,47,39,0.18)] backdrop-blur-sm lg:hidden">
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0">
          <div className="max-h-[45vh] overflow-y-auto border-b border-[#EFE7DA] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#A9998A]">Your Cleaning</p>
            {lines.length === 0 ? (
              <p className="mt-2 text-sm text-[#A9998A]">Your selections will appear here as you go.</p>
            ) : (
              <dl className="mt-3 space-y-2">
                {lines.map((line) => (
                  <div key={line.label} className="flex items-baseline justify-between gap-4">
                    <dt className="text-xs text-[#A9998A]">{line.label}</dt>
                    <dd className="text-right text-sm font-medium text-[#6B5B4C]">{line.value}</dd>
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
        className="flex w-full items-center justify-between gap-4 px-5 pt-3.5 transition-colors duration-150 active:bg-[#FBF7EF] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#3B2F27]"
        style={{ paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom))" }}
      >
        <span className="min-w-0 text-left">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#B9AC9B]">
            Estimated total
          </span>
          <span className="flex items-baseline gap-2.5">
            <span className={`font-heading text-2xl text-[#3B2F27] ${totalPulse}`}>
              {estimate ? formatCurrency(estimate.totalPrice) : "Custom estimate"}
            </span>
            <span className={`flex items-center gap-1 text-xs font-medium text-[#8A7A6B] ${durationPulse}`}>
              <Clock size={12} className="shrink-0" aria-hidden="true" />
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

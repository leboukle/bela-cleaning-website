"use client";

import { Clock } from "lucide-react";
import { formatCurrency, formatDuration, type EstimateBreakdown } from "@/lib/booking/calculate";
import { getSummaryLines } from "@/lib/booking/summary";
import type { BookingState } from "@/lib/booking/types";
import { usePulseClass } from "@/components/booking/usePulseClass";

const PULSE = "animate-[booking-value-pop_0.3s_ease-out]";

type BookingSummaryProps = {
  state: BookingState;
  estimate: EstimateBreakdown | null;
};

// Desktop sticky sidebar. Estimated total leads as the visual focal point
// (largest, top-most), duration reads as a secondary line beneath it, and
// the selected-details list is demoted below a divider in smaller, muted
// type — closer to a checkout summary than a form recap. Intentionally
// still no line-by-line dollar breakdown — individual prices stay on the
// selection cards themselves while the customer is choosing.
export default function BookingSummary({ state, estimate }: BookingSummaryProps) {
  const lines = getSummaryLines(state);
  const totalPulse = usePulseClass(estimate ? estimate.totalPrice : "custom", PULSE);
  const durationPulse = usePulseClass(estimate ? estimate.totalDurationMinutes : "custom-duration", PULSE);

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-28 rounded-2xl border border-[#E7DECE] bg-white p-7 shadow-[0_4px_24px_-8px_rgba(59,47,39,0.12)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#A9998A]">Your Cleaning</p>

        <p className={`mt-3 font-heading text-4xl text-[#3B2F27] ${totalPulse}`}>
          {estimate ? formatCurrency(estimate.totalPrice) : "Custom estimate"}
        </p>
        <p className="mt-1 text-xs uppercase tracking-wide text-[#B9AC9B]">Estimated total</p>

        <div className={`mt-4 flex items-center gap-1.5 text-sm text-[#6B5B4C] ${durationPulse}`}>
          <Clock size={15} className="text-[#B9AC9B]" aria-hidden="true" />
          <span>{estimate ? formatDuration(estimate.totalDurationMinutes) : "Duration to be determined"}</span>
        </div>

        {lines.length === 0 ? (
          <p className="mt-6 border-t border-[#EFE7DA] pt-5 text-sm text-[#A9998A]">
            Your selections will appear here as you go.
          </p>
        ) : (
          <dl className="mt-6 space-y-2.5 border-t border-[#EFE7DA] pt-5">
            {lines.map((line) => (
              <div key={line.label} className="flex items-baseline justify-between gap-4">
                <dt className="text-xs text-[#A9998A]">{line.label}</dt>
                <dd className="text-right text-sm font-medium text-[#6B5B4C]">{line.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </aside>
  );
}

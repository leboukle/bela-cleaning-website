"use client";

import { formatCurrency, formatDuration, type EstimateBreakdown } from "@/lib/booking/calculate";
import { getSummaryLines } from "@/lib/booking/summary";
import type { BookingState } from "@/lib/booking/types";

type BookingSummaryProps = {
  state: BookingState;
  estimate: EstimateBreakdown | null;
};

// Desktop sticky sidebar. Intentionally does not show a line-by-line
// dollar breakdown — individual prices stay visible on the selection
// cards themselves while the customer is choosing.
export default function BookingSummary({ state, estimate }: BookingSummaryProps) {
  const lines = getSummaryLines(state);

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-28 rounded-xl border-2 border-[#E7DECE] bg-white p-6">
        <h2 className="font-heading text-xl text-[#3B2F27]">Your Cleaning</h2>

        {lines.length === 0 ? (
          <p className="mt-3 text-sm text-[#A9998A]">
            Your selections will appear here as you go.
          </p>
        ) : (
          <dl className="mt-4 space-y-3 border-b border-[#EFE7DA] pb-5">
            {lines.map((line) => (
              <div key={line.label}>
                <dt className="text-xs uppercase tracking-wide text-[#A9998A]">{line.label}</dt>
                <dd className="text-sm font-medium text-[#3B2F27]">{line.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-5 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#A9998A]">Estimated total</p>
            <p
              key={estimate ? estimate.totalPrice : "custom"}
              className="animate-[booking-value-pop_0.25s_ease-out] font-heading text-3xl text-[#3B2F27]"
            >
              {estimate ? formatCurrency(estimate.totalPrice) : "Custom estimate"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#A9998A]">Estimated duration</p>
            <p
              key={estimate ? estimate.totalDurationMinutes : "custom"}
              className="animate-[booking-value-pop_0.25s_ease-out] text-lg font-medium text-[#3B2F27]"
            >
              {estimate ? formatDuration(estimate.totalDurationMinutes) : "To be determined"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

"use client";

import { useMemo } from "react";
import { ARRIVAL_WINDOWS, isArrivalWindowSelectable } from "@/lib/booking/schedule";
import type { ArrivalWindowId } from "@/lib/booking/types";
import SelectionCard from "@/components/booking/SelectionCard";
import StepShell from "@/components/booking/StepShell";

type ArrivalWindowStepProps = {
  value: ArrivalWindowId | null;
  appointmentDate: string | null;
  onSelect: (id: ArrivalWindowId) => void;
  onBack: () => void;
  /** Overridable for tests; defaults to the real current date. */
  today?: Date;
};

export default function ArrivalWindowStep({ value, appointmentDate, onSelect, onBack, today }: ArrivalWindowStepProps) {
  // Client-side hint only (server re-checks per-window on submission): on
  // the earliest bookable date, a window earlier than the current time + 24h
  // may no longer qualify even though the date itself is selectable (the
  // Calendar admits a date if its *latest* window still qualifies).
  const referenceToday = useMemo(() => today ?? new Date(), [today]);
  const eligibility = useMemo(() => {
    const map = new Map<ArrivalWindowId, boolean>();
    for (const option of ARRIVAL_WINDOWS) {
      map.set(option.id, appointmentDate ? isArrivalWindowSelectable(appointmentDate, option.id, referenceToday) : true);
    }
    return map;
  }, [appointmentDate, referenceToday]);
  const anyIneligible = Array.from(eligibility.values()).some((selectable) => !selectable);

  return (
    <StepShell
      question="What arrival window works best?"
      note="Your cleaner will arrive within this window, and we'll text you when they're on the way."
      onBack={onBack}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ARRIVAL_WINDOWS.map((option) => {
          const selectable = eligibility.get(option.id) ?? true;
          return (
            <SelectionCard
              key={option.id}
              label={option.label}
              priceLabel={option.timeRangeLabel}
              selected={value === option.id}
              onSelect={() => selectable && onSelect(option.id)}
              disabled={!selectable}
              role="radio"
            />
          );
        })}
      </div>
      {anyIneligible && (
        <p className="mt-4 text-sm text-[#6B5B4C]">
          Some windows on this date are less than 24 hours away and are no longer available — please choose a later
          window, or go back and pick a later date.
        </p>
      )}
    </StepShell>
  );
}

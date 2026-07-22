"use client";

import { ARRIVAL_WINDOWS } from "@/lib/booking/schedule";
import type { ArrivalWindowId } from "@/lib/booking/types";
import SelectionCard from "@/components/booking/SelectionCard";
import StepShell from "@/components/booking/StepShell";

type ArrivalWindowStepProps = {
  value: ArrivalWindowId | null;
  onSelect: (id: ArrivalWindowId) => void;
  onBack: () => void;
};

export default function ArrivalWindowStep({ value, onSelect, onBack }: ArrivalWindowStepProps) {
  return (
    <StepShell
      question="What arrival window works best?"
      note="This is your preferred arrival window, not a guaranteed exact arrival time."
      onBack={onBack}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ARRIVAL_WINDOWS.map((option) => (
          <SelectionCard
            key={option.id}
            label={option.label}
            priceLabel={option.timeRangeLabel}
            selected={value === option.id}
            onSelect={() => onSelect(option.id)}
            role="radio"
          />
        ))}
      </div>
    </StepShell>
  );
}

"use client";

import { BATHROOM_OPTIONS } from "@/lib/booking/config";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import type { BathroomId } from "@/lib/booking/types";
import SelectionCard from "@/components/booking/SelectionCard";
import StepShell from "@/components/booking/StepShell";

type BathroomsStepProps = {
  value: BathroomId | null;
  onSelect: (id: BathroomId) => void;
  onBack: () => void;
};

export default function BathroomsStep({ value, onSelect, onBack }: BathroomsStepProps) {
  return (
    <StepShell question="And how many bathrooms?" onBack={onBack}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {BATHROOM_OPTIONS.map((option) => (
          <SelectionCard
            key={option.id}
            label={option.label}
            priceLabel={
              option.customEstimate
                ? undefined
                : option.note ?? `+${formatCurrency(option.priceAdd ?? 0)}`
            }
            durationLabel={
              option.customEstimate || option.durationMinutes === 0
                ? undefined
                : `+${formatDuration(option.durationMinutes ?? 0)}`
            }
            selected={value === option.id}
            onSelect={() => onSelect(option.id)}
            role="radio"
          />
        ))}
      </div>
    </StepShell>
  );
}

"use client";

import { BEDROOM_OPTIONS } from "@/lib/booking/config";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import type { BedroomId } from "@/lib/booking/types";
import SelectionCard from "@/components/booking/SelectionCard";
import StepShell from "@/components/booking/StepShell";

type BedroomsStepProps = {
  value: BedroomId | null;
  onSelect: (id: BedroomId) => void;
  onBack: () => void;
};

export default function BedroomsStep({ value, onSelect, onBack }: BedroomsStepProps) {
  return (
    <StepShell question="How many bedrooms?" onBack={onBack}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BEDROOM_OPTIONS.map((option) => (
          <SelectionCard
            key={option.id}
            label={option.label}
            priceLabel={option.customEstimate ? undefined : formatCurrency(option.price ?? 0)}
            durationLabel={option.customEstimate ? undefined : formatDuration(option.durationMinutes ?? 0)}
            selected={value === option.id}
            onSelect={() => onSelect(option.id)}
            role="radio"
          />
        ))}
      </div>
    </StepShell>
  );
}

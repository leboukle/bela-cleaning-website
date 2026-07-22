"use client";

import { CLEANING_TYPE_OPTIONS } from "@/lib/booking/config";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import type { CleaningTypeId } from "@/lib/booking/types";
import SelectionCard from "@/components/booking/SelectionCard";
import StepShell from "@/components/booking/StepShell";

type CleaningTypeStepProps = {
  value: CleaningTypeId | null;
  onSelect: (id: CleaningTypeId) => void;
  onBack: () => void;
};

export default function CleaningTypeStep({ value, onSelect, onBack }: CleaningTypeStepProps) {
  return (
    <StepShell question="What kind of clean are you looking for?" onBack={onBack}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CLEANING_TYPE_OPTIONS.map((option) => (
          <SelectionCard
            key={option.id}
            label={option.label}
            description={option.description}
            priceLabel={option.priceAdd === 0 ? "Included" : `+${formatCurrency(option.priceAdd)}`}
            durationLabel={option.durationMinutes === 0 ? undefined : `+${formatDuration(option.durationMinutes)}`}
            selected={value === option.id}
            onSelect={() => onSelect(option.id)}
            role="radio"
          />
        ))}
      </div>
    </StepShell>
  );
}

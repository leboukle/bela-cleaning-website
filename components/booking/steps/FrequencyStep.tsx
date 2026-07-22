"use client";

import { FREQUENCY_OPTIONS } from "@/lib/booking/config";
import type { FrequencyId } from "@/lib/booking/types";
import SelectionCard from "@/components/booking/SelectionCard";
import StepShell from "@/components/booking/StepShell";

type FrequencyStepProps = {
  value: FrequencyId | null;
  onSelect: (id: FrequencyId) => void;
  onBack: () => void;
};

export default function FrequencyStep({ value, onSelect, onBack }: FrequencyStepProps) {
  return (
    <StepShell
      question="How often would you like this service?"
      note="Recurring discounts apply to your bedroom base price."
      onBack={onBack}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FREQUENCY_OPTIONS.map((option) => (
          <SelectionCard
            key={option.id}
            label={option.label}
            priceLabel={option.discount === 0 ? undefined : option.discountLabel}
            selected={value === option.id}
            onSelect={() => onSelect(option.id)}
            role="radio"
          />
        ))}
      </div>
    </StepShell>
  );
}

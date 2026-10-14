"use client";

import { FREQUENCY_OPTIONS } from "@/lib/booking/config";
import type { FrequencyId } from "@/lib/booking/types";
import { FIRST_CLEANING_NOTICE, RECURRING_CONTROLS_NOTICE } from "@/lib/booking/recurringPricing";
import SelectionCard from "@/components/booking/SelectionCard";
import StepShell from "@/components/booking/StepShell";

type FrequencyStepProps = {
  value: FrequencyId | null;
  onSelect: (id: FrequencyId) => void;
  onBack: () => void;
};

export default function FrequencyStep({ value, onSelect, onBack }: FrequencyStepProps) {
  // Shown for every choice on this step: a one-time booking is unaffected,
  // and the statement is exactly what applies to any recurring option.
  const note = `Choosing a recurring option? ${FIRST_CLEANING_NOTICE} ${RECURRING_CONTROLS_NOTICE}`;

  return (
    <StepShell question="How often should we come by?" note={note} onBack={onBack}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FREQUENCY_OPTIONS.map((option) => (
          <SelectionCard
            key={option.id}
            label={option.label}
            priceLabel={option.discount === 0 ? undefined : `${option.discountLabel} after your first cleaning`}
            selected={value === option.id}
            onSelect={() => onSelect(option.id)}
            role="radio"
          />
        ))}
      </div>
    </StepShell>
  );
}

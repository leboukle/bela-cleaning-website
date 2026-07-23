"use client";

import { SQUARE_FOOTAGE_OPTIONS } from "@/lib/booking/config";
import type { SquareFootageId } from "@/lib/booking/types";
import SelectionCard from "@/components/booking/SelectionCard";
import StepShell from "@/components/booking/StepShell";

type SquareFootageStepProps = {
  value: SquareFootageId | null;
  onSelect: (id: SquareFootageId) => void;
  onBack: () => void;
};

export default function SquareFootageStep({ value, onSelect, onBack }: SquareFootageStepProps) {
  return (
    <StepShell question="How much space should we plan for?" note="A rough estimate is perfectly fine." onBack={onBack}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SQUARE_FOOTAGE_OPTIONS.map((option) => (
          <SelectionCard
            key={option.id}
            label={option.label}
            selected={value === option.id}
            onSelect={() => onSelect(option.id)}
            role="radio"
          />
        ))}
      </div>
    </StepShell>
  );
}

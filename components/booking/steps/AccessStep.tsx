"use client";

import type { AccessId } from "@/lib/booking/types";
import SelectionCard from "@/components/booking/SelectionCard";
import StepShell from "@/components/booking/StepShell";

type AccessStepProps = {
  value: AccessId | null;
  onSelect: (id: AccessId) => void;
  onBack: () => void;
};

export default function AccessStep({ value, onSelect, onBack }: AccessStepProps) {
  return (
    <StepShell question="Will someone be home during the cleaning?" onBack={onBack}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectionCard
          label="Yes, someone will be home"
          selected={value === "home"}
          onSelect={() => onSelect("home")}
          role="radio"
        />
        <SelectionCard
          label="No, no one will be home"
          selected={value === "not-home"}
          onSelect={() => onSelect("not-home")}
          role="radio"
        />
      </div>
    </StepShell>
  );
}

"use client";

import { PROPERTY_TYPE_OPTIONS } from "@/lib/booking/config";
import type { PropertyTypeId } from "@/lib/booking/types";
import SelectionCard from "@/components/booking/SelectionCard";
import StepShell from "@/components/booking/StepShell";

type PropertyTypeStepProps = {
  value: PropertyTypeId | null;
  otherValue: string;
  onSelect: (id: PropertyTypeId) => void;
  onOtherChange: (text: string) => void;
  onContinueOther: () => void;
  onBack: () => void;
};

// Auto-advances on selection for every option except "Other", which reveals
// a text field and requires an explicit Continue instead.
export default function PropertyTypeStep({
  value,
  otherValue,
  onSelect,
  onOtherChange,
  onContinueOther,
  onBack,
}: PropertyTypeStepProps) {
  return (
    <StepShell question="What type of property is it?" onBack={onBack}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PROPERTY_TYPE_OPTIONS.map((option) => (
          <SelectionCard
            key={option.id}
            label={option.label}
            selected={value === option.id}
            onSelect={() => onSelect(option.id)}
            role="radio"
          />
        ))}
      </div>

      {value === "other" && (
        <div className="mt-5 rounded-xl border-2 border-[#E7DECE] bg-white p-5">
          <label htmlFor="property-type-other" className="text-sm font-medium text-[#3B2F27]">
            Tell us what kind of property it is
          </label>
          <input
            id="property-type-other"
            type="text"
            value={otherValue}
            onChange={(event) => onOtherChange(event.target.value)}
            placeholder="e.g. Loft, carriage house..."
            className="mt-1.5 w-full rounded-lg border border-[#E7DECE] bg-white px-4 py-2.5 text-[#3B2F27] transition-colors duration-150 placeholder:text-[#A9998A] focus:border-[#3B2F27]"
          />
          <button
            type="button"
            onClick={onContinueOther}
            disabled={!otherValue.trim()}
            className="mt-4 inline-flex items-center justify-center rounded-full bg-[#3B2F27] px-7 py-3 text-sm font-medium tracking-wide text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2A211C] hover:shadow-lg active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            Continue
          </button>
        </div>
      )}
    </StepShell>
  );
}

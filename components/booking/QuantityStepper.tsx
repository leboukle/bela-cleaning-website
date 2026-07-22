"use client";

import { Minus, Plus } from "lucide-react";

type QuantityStepperProps = {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
};

export default function QuantityStepper({ label, value, onChange, min = 0, max = 30 }: QuantityStepperProps) {
  return (
    <div className="flex items-center gap-3" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label={`Decrease ${label} quantity`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#C9BCA6] text-[#3B2F27] transition-all duration-150 hover:bg-[#F1E9DC] active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
      >
        <Minus size={14} />
      </button>
      <span
        key={value}
        className="w-6 animate-[booking-value-pop_0.2s_ease-out] text-center text-sm font-semibold text-[#3B2F27]"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label} quantity`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#C9BCA6] text-[#3B2F27] transition-all duration-150 hover:bg-[#F1E9DC] active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

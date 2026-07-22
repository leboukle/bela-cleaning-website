"use client";

import { Minus, Plus } from "lucide-react";
import { usePulseClass } from "@/components/booking/usePulseClass";

type QuantityStepperProps = {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
};

export default function QuantityStepper({ label, value, onChange, min = 0, max = 30 }: QuantityStepperProps) {
  const pulse = usePulseClass(value, "animate-[booking-value-pop_0.2s_ease-out]");

  return (
    <div className="flex items-center gap-4" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label={`Decrease ${label} quantity`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#C9BCA6] text-[#3B2F27] transition-all duration-150 hover:border-[#3B2F27] hover:bg-[#F1E9DC] active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
      >
        <Minus size={15} />
      </button>
      <span
        className={`w-6 text-center text-base font-semibold text-[#3B2F27] ${pulse}`}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label} quantity`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#C9BCA6] text-[#3B2F27] transition-all duration-150 hover:border-[#3B2F27] hover:bg-[#F1E9DC] active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

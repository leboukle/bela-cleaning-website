"use client";

import { Check } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

type SelectionCardProps = {
  label: string;
  description?: string;
  priceLabel?: string;
  durationLabel?: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  /** "radio" for single-select groups, "toggle" for independent multi-select. */
  role?: "radio" | "toggle";
  className?: string;
  children?: ReactNode;
};

// Large clickable selection card used throughout the booking prototype in
// place of traditional radio buttons or checkboxes. Selection state is
// communicated through more than color alone: a heavier border, a filled
// checkmark badge, and a background tint all change together.
//
// Rendered as a <div> with role="radio"/"button" (not a native <button>)
// because some cards (interior windows, blinds) nest a QuantityStepper —
// which renders its own <button>s — inside `children`. Nesting interactive
// <button> elements inside a <button> is invalid HTML and causes browsers
// to silently restructure the DOM, corrupting click targeting. A div with
// a keyboard handler keeps this accessible without that problem.
export default function SelectionCard({
  label,
  description,
  priceLabel,
  durationLabel,
  selected,
  onSelect,
  disabled = false,
  role = "radio",
  className = "",
  children,
}: SelectionCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role={role === "radio" ? "radio" : "button"}
      aria-checked={role === "radio" ? selected : undefined}
      aria-pressed={role === "toggle" ? selected : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={handleKeyDown}
      className={`group relative flex h-full flex-col items-start gap-1 rounded-xl border-2 p-5 text-left transition-all duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27] ${
        selected
          ? "border-[#3B2F27] bg-[#F1E9DC] shadow-sm"
          : "border-[#E7DECE] bg-white hover:-translate-y-0.5 hover:border-[#C9BCA6] hover:shadow-md"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer active:translate-y-0 active:scale-[0.98]"} ${className}`}
    >
      {selected && (
        <span
          className="absolute right-4 top-4 flex h-6 w-6 animate-[booking-check-pop_0.3s_ease-out] items-center justify-center rounded-full bg-[#3B2F27] text-white"
          aria-hidden="true"
        >
          <Check size={14} strokeWidth={3} />
        </span>
      )}
      <span className="pr-8 font-heading text-lg text-[#3B2F27]">{label}</span>
      {description && <span className="text-sm text-[#8A7A6B] leading-relaxed">{description}</span>}
      {(priceLabel || durationLabel) && (
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-[#6B5B4C]">
          {priceLabel && <span>{priceLabel}</span>}
          {priceLabel && durationLabel && <span aria-hidden="true">·</span>}
          {durationLabel && <span>{durationLabel}</span>}
        </span>
      )}
      {children}
    </div>
  );
}

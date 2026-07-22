"use client";

import { EXTRAS_CONFIG } from "@/lib/booking/config";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import type { ExtrasState } from "@/lib/booking/types";
import SelectionCard from "@/components/booking/SelectionCard";
import QuantityStepper from "@/components/booking/QuantityStepper";
import StepShell from "@/components/booking/StepShell";

type ExtrasStepProps = {
  extras: ExtrasState;
  onChange: (next: ExtrasState) => void;
  onContinue: () => void;
  onBack: () => void;
};

// Multi-select step: any combination of flat-fee extras and per-unit
// quantities, or "No extras" as a mutually-exclusive shortcut. "No extras"
// is a reversible toggle, not a locked state — selecting any regular extra
// while it's active clears it automatically (see toggleFlat/setQty below),
// and clicking "No extras" a second time unselects it. Cards are never
// `disabled`: a disabled SelectionCard can't be clicked, which would make
// this recovery path unreachable.
// Nothing here auto-advances — the customer confirms with Continue.
export default function ExtrasStep({ extras, onChange, onContinue, onBack }: ExtrasStepProps) {
  const toggleFlat = (key: "kitchenCabinets" | "refrigerator" | "oven") => {
    onChange({ ...extras, [key]: !extras[key], noExtras: false });
  };

  const setInteriorWindowsQty = (qty: number) => {
    onChange({ ...extras, interiorWindowsQty: qty, noExtras: false });
  };

  const setBlindsQty = (qty: number) => {
    onChange({ ...extras, blindsQty: qty, noExtras: false });
  };

  const toggleNoExtras = () => {
    if (extras.noExtras) {
      onChange({ ...extras, noExtras: false });
      return;
    }
    onChange({
      kitchenCabinets: false,
      refrigerator: false,
      oven: false,
      interiorWindowsQty: 0,
      blindsQty: 0,
      noExtras: true,
    });
  };

  const hasSelection =
    extras.noExtras ||
    extras.kitchenCabinets ||
    extras.refrigerator ||
    extras.oven ||
    extras.interiorWindowsQty > 0 ||
    extras.blindsQty > 0;

  return (
    <StepShell question="Would you like to add any extras?" note="Select as many as you'd like." onBack={onBack}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectionCard
          label={EXTRAS_CONFIG.kitchenCabinets.label}
          priceLabel={`+${formatCurrency(EXTRAS_CONFIG.kitchenCabinets.price)}`}
          durationLabel={`+${formatDuration(EXTRAS_CONFIG.kitchenCabinets.durationMinutes)}`}
          selected={extras.kitchenCabinets}
          onSelect={() => toggleFlat("kitchenCabinets")}
          role="toggle"
        />
        <SelectionCard
          label={EXTRAS_CONFIG.refrigerator.label}
          priceLabel={`+${formatCurrency(EXTRAS_CONFIG.refrigerator.price)}`}
          durationLabel={`+${formatDuration(EXTRAS_CONFIG.refrigerator.durationMinutes)}`}
          selected={extras.refrigerator}
          onSelect={() => toggleFlat("refrigerator")}
          role="toggle"
        />
        <SelectionCard
          label={EXTRAS_CONFIG.oven.label}
          priceLabel={`+${formatCurrency(EXTRAS_CONFIG.oven.price)}`}
          durationLabel={`+${formatDuration(EXTRAS_CONFIG.oven.durationMinutes)}`}
          selected={extras.oven}
          onSelect={() => toggleFlat("oven")}
          role="toggle"
        />

        <SelectionCard
          label={EXTRAS_CONFIG.interiorWindows.label}
          priceLabel={`+${formatCurrency(EXTRAS_CONFIG.interiorWindows.pricePerUnit)}/window`}
          durationLabel={`+${formatDuration(EXTRAS_CONFIG.interiorWindows.durationPerUnitMinutes)}/window`}
          selected={extras.interiorWindowsQty > 0}
          onSelect={() => setInteriorWindowsQty(extras.interiorWindowsQty > 0 ? 0 : 1)}
          role="toggle"
        >
          {extras.interiorWindowsQty > 0 && (
            <div className="mt-3">
              <QuantityStepper
                label="interior windows"
                value={extras.interiorWindowsQty}
                onChange={setInteriorWindowsQty}
                min={1}
              />
            </div>
          )}
        </SelectionCard>

        <SelectionCard
          label={EXTRAS_CONFIG.blinds.label}
          priceLabel={`+${formatCurrency(EXTRAS_CONFIG.blinds.pricePerUnit)}/blind`}
          selected={extras.blindsQty > 0}
          onSelect={() => setBlindsQty(extras.blindsQty > 0 ? 0 : 1)}
          role="toggle"
        >
          {extras.blindsQty > 0 && (
            <div className="mt-3">
              <QuantityStepper label="blinds" value={extras.blindsQty} onChange={setBlindsQty} min={1} />
            </div>
          )}
        </SelectionCard>

        <SelectionCard label="No extras" selected={extras.noExtras} onSelect={toggleNoExtras} role="toggle" />
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!hasSelection}
        className="mt-6 inline-flex items-center justify-center rounded-full bg-[#3B2F27] px-7 py-3.5 text-sm font-medium tracking-wide text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2A211C] hover:shadow-lg active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        Continue
      </button>
    </StepShell>
  );
}

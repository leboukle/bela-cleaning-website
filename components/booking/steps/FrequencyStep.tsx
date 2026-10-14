"use client";

import { FREQUENCY_OPTIONS } from "@/lib/booking/config";
import type { FrequencyId } from "@/lib/booking/types";
import type { FollowUpEligibilityState } from "@/components/booking/useFollowUpEligibility";
import SelectionCard from "@/components/booking/SelectionCard";
import StepShell from "@/components/booking/StepShell";

type FrequencyStepProps = {
  value: FrequencyId | null;
  onSelect: (id: FrequencyId) => void;
  onBack: () => void;
  /** Present when the booking was opened from a "Book your next cleaning" link. */
  followUp?: FollowUpEligibilityState;
};

export default function FrequencyStep({ value, onSelect, onBack, followUp = { status: "none" } }: FrequencyStepProps) {
  const applied = followUp.status === "eligible";

  let note = "Your first cleaning is charged at the regular price. Your discount starts with your second cleaning.";
  if (applied) {
    note = "This is a follow-up cleaning, so your recurring discount applies to this visit.";
  } else if (followUp.status === "ineligible") {
    note =
      followUp.reason === "first-cleaning-not-completed"
        ? "We can't apply a recurring discount yet because your first cleaning hasn't been marked completed. This cleaning will be charged at the regular price."
        : "We couldn't apply a recurring discount for this link, so this cleaning will be charged at the regular price.";
  }

  return (
    <StepShell question="How often should we come by?" note={note} onBack={onBack}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FREQUENCY_OPTIONS.map((option) => (
          <SelectionCard
            key={option.id}
            label={option.label}
            priceLabel={
              option.discount === 0
                ? undefined
                : applied
                  ? `${option.discountLabel} on this cleaning`
                  : `${option.discountLabel} from your 2nd cleaning`
            }
            selected={value === option.id}
            onSelect={() => onSelect(option.id)}
            role="radio"
          />
        ))}
      </div>
    </StepShell>
  );
}

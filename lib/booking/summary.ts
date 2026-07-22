// Builds the human-readable "selected so far" list shown in both the
// desktop sidebar and mobile bottom-bar summaries, so the two stay in sync
// by construction instead of duplicating this logic in two components.
import {
  BATHROOM_OPTIONS,
  BEDROOM_OPTIONS,
  CLEANING_TYPE_OPTIONS,
  EXTRAS_CONFIG,
  FREQUENCY_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  SQUARE_FOOTAGE_OPTIONS,
} from "./config";
import type { BookingState } from "./types";

export type SummaryLine = {
  label: string;
  value: string;
};

export function getSummaryLines(state: BookingState): SummaryLine[] {
  const lines: SummaryLine[] = [];

  if (state.propertyType) {
    const option = PROPERTY_TYPE_OPTIONS.find((o) => o.id === state.propertyType);
    const value =
      state.propertyType === "other" && state.propertyTypeOther.trim()
        ? `Other — ${state.propertyTypeOther.trim()}`
        : (option?.label ?? "");
    lines.push({ label: "Property type", value });
  }

  if (state.squareFootage) {
    const option = SQUARE_FOOTAGE_OPTIONS.find((o) => o.id === state.squareFootage);
    if (option) lines.push({ label: "Square footage", value: option.label });
  }

  if (state.bedrooms) {
    const option = BEDROOM_OPTIONS.find((o) => o.id === state.bedrooms);
    if (option) lines.push({ label: "Bedrooms", value: option.label });
  }

  if (state.bathrooms) {
    const option = BATHROOM_OPTIONS.find((o) => o.id === state.bathrooms);
    if (option) lines.push({ label: "Bathrooms", value: option.label });
  }

  if (state.cleaningType) {
    const option = CLEANING_TYPE_OPTIONS.find((o) => o.id === state.cleaningType);
    if (option) lines.push({ label: "Cleaning type", value: option.label });
  }

  const extraLabels: string[] = [];
  if (state.extras.noExtras) {
    extraLabels.push("No extras");
  } else {
    if (state.extras.kitchenCabinets) extraLabels.push(EXTRAS_CONFIG.kitchenCabinets.label);
    if (state.extras.refrigerator) extraLabels.push(EXTRAS_CONFIG.refrigerator.label);
    if (state.extras.oven) extraLabels.push(EXTRAS_CONFIG.oven.label);
    if (state.extras.interiorWindowsQty > 0) {
      extraLabels.push(`Interior windows × ${state.extras.interiorWindowsQty}`);
    }
    if (state.extras.blindsQty > 0) {
      extraLabels.push(`Blinds × ${state.extras.blindsQty}`);
    }
  }
  if (extraLabels.length > 0) {
    lines.push({ label: "Extras", value: extraLabels.join(", ") });
  }

  if (state.frequency) {
    const option = FREQUENCY_OPTIONS.find((o) => o.id === state.frequency);
    if (option) lines.push({ label: "Frequency", value: option.label });
  }

  return lines;
}

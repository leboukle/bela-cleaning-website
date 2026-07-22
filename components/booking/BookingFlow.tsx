"use client";

import { useMemo, useState } from "react";
import {
  BATHROOM_OPTIONS,
  BEDROOM_OPTIONS,
  SQUARE_FOOTAGE_OPTIONS,
  STEP_STAGE,
} from "@/lib/booking/config";
import { calculateEstimate } from "@/lib/booking/calculate";
import {
  initialBookingState,
  STEP_ORDER,
  type BathroomId,
  type BedroomId,
  type CleaningTypeId,
  type ExtrasState,
  type FrequencyId,
  type PropertyTypeId,
  type SquareFootageId,
} from "@/lib/booking/types";
import ProgressIndicator from "@/components/booking/ProgressIndicator";
import BookingSummary from "@/components/booking/BookingSummary";
import MobileSummaryBar from "@/components/booking/MobileSummaryBar";
import CustomEstimateNotice from "@/components/booking/CustomEstimateNotice";
import IntroStep from "@/components/booking/steps/IntroStep";
import PropertyTypeStep from "@/components/booking/steps/PropertyTypeStep";
import SquareFootageStep from "@/components/booking/steps/SquareFootageStep";
import BedroomsStep from "@/components/booking/steps/BedroomsStep";
import BathroomsStep from "@/components/booking/steps/BathroomsStep";
import CleaningTypeStep from "@/components/booking/steps/CleaningTypeStep";
import ExtrasStep from "@/components/booking/steps/ExtrasStep";
import FrequencyStep from "@/components/booking/steps/FrequencyStep";
import PlaceholderStep from "@/components/booking/steps/PlaceholderStep";

const CUSTOM_ESTIMATE_MESSAGES: Record<"square-footage" | "bedrooms" | "bathrooms", string> = {
  "square-footage":
    "Properties over 4,000 sq. ft. need a custom estimate rather than an instant price.",
  bedrooms: "Homes with more than 5 bedrooms need a custom estimate rather than an instant price.",
  bathrooms: "Homes with more than 4 bathrooms need a custom estimate rather than an instant price.",
};

// Orchestrates the linear question flow: owns BookingState, advances or
// rewinds stepIndex, and branches into the custom-estimate stop screen
// whenever the current step's selection is out of instant-pricing range.
export default function BookingFlow() {
  const [state, setState] = useState(initialBookingState);

  const currentStepId = STEP_ORDER[state.stepIndex];
  const estimate = useMemo(() => calculateEstimate(state), [state]);

  const goBack = () => setState((s) => ({ ...s, stepIndex: Math.max(s.stepIndex - 1, 0) }));
  const advance = () =>
    setState((s) => ({ ...s, stepIndex: Math.min(s.stepIndex + 1, STEP_ORDER.length - 1) }));

  const selectPropertyType = (id: PropertyTypeId) => {
    setState((s) => ({ ...s, propertyType: id, propertyTypeOther: id === "other" ? s.propertyTypeOther : "" }));
    if (id !== "other") advance();
  };
  const setPropertyTypeOther = (text: string) => setState((s) => ({ ...s, propertyTypeOther: text }));

  const selectSquareFootage = (id: SquareFootageId) => {
    const option = SQUARE_FOOTAGE_OPTIONS.find((o) => o.id === id);
    const triggers = Boolean(option?.customEstimate);
    setState((s) => ({ ...s, squareFootage: id, customEstimateTrigger: triggers ? "square-footage" : null }));
    if (!triggers) advance();
  };

  const selectBedrooms = (id: BedroomId) => {
    const option = BEDROOM_OPTIONS.find((o) => o.id === id);
    const triggers = Boolean(option?.customEstimate);
    setState((s) => ({ ...s, bedrooms: id, customEstimateTrigger: triggers ? "bedrooms" : null }));
    if (!triggers) advance();
  };

  const selectBathrooms = (id: BathroomId) => {
    const option = BATHROOM_OPTIONS.find((o) => o.id === id);
    const triggers = Boolean(option?.customEstimate);
    setState((s) => ({ ...s, bathrooms: id, customEstimateTrigger: triggers ? "bathrooms" : null }));
    if (!triggers) advance();
  };

  const selectCleaningType = (id: CleaningTypeId) => {
    setState((s) => ({ ...s, cleaningType: id }));
    advance();
  };

  const setExtras = (next: ExtrasState) => setState((s) => ({ ...s, extras: next }));

  const selectFrequency = (id: FrequencyId) => {
    setState((s) => ({ ...s, frequency: id }));
    advance();
  };

  const setCustomEstimateNotes = (text: string) => setState((s) => ({ ...s, customEstimateNotes: text }));
  const clearCustomEstimateTrigger = () => setState((s) => ({ ...s, customEstimateTrigger: null }));

  const stage = STEP_STAGE[currentStepId];

  const renderStep = () => {
    if (state.customEstimateTrigger) {
      return (
        <CustomEstimateNotice
          message={CUSTOM_ESTIMATE_MESSAGES[state.customEstimateTrigger]}
          notes={state.customEstimateNotes}
          onNotesChange={setCustomEstimateNotes}
          onBack={clearCustomEstimateTrigger}
        />
      );
    }

    switch (currentStepId) {
      case "intro":
        return <IntroStep onStart={advance} />;
      case "property-type":
        return (
          <PropertyTypeStep
            value={state.propertyType}
            otherValue={state.propertyTypeOther}
            onSelect={selectPropertyType}
            onOtherChange={setPropertyTypeOther}
            onContinueOther={advance}
            onBack={goBack}
          />
        );
      case "square-footage":
        return <SquareFootageStep value={state.squareFootage} onSelect={selectSquareFootage} onBack={goBack} />;
      case "bedrooms":
        return <BedroomsStep value={state.bedrooms} onSelect={selectBedrooms} onBack={goBack} />;
      case "bathrooms":
        return <BathroomsStep value={state.bathrooms} onSelect={selectBathrooms} onBack={goBack} />;
      case "cleaning-type":
        return <CleaningTypeStep value={state.cleaningType} onSelect={selectCleaningType} onBack={goBack} />;
      case "extras":
        return (
          <ExtrasStep extras={state.extras} onChange={setExtras} onContinue={advance} onBack={goBack} />
        );
      case "frequency":
        return <FrequencyStep value={state.frequency} onSelect={selectFrequency} onBack={goBack} />;
      case "schedule":
        return (
          <PlaceholderStep
            question="Choose your appointment"
            description="In a future milestone, you'll pick an available date and time here based on your location and the crew's schedule."
            continueLabel="Continue to your details"
            onContinue={advance}
            onBack={goBack}
          />
        );
      case "details":
        return (
          <PlaceholderStep
            question="Your contact and service details"
            description="In a future milestone, you'll enter your name, address, and any access or pet notes for the cleaning crew here."
            continueLabel="Continue to review"
            onContinue={advance}
            onBack={goBack}
          />
        );
      case "review":
        return (
          <PlaceholderStep
            question="Review and payment"
            description="In a future milestone, you'll review your full booking and securely enter payment here to confirm your appointment. This preview stops before any payment step — nothing has been booked or charged."
            onBack={goBack}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div>
      {currentStepId !== "intro" && <ProgressIndicator currentStage={stage} />}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
        <div
          key={`${currentStepId}-${state.customEstimateTrigger ?? "answering"}`}
          className="animate-[booking-step-in_0.35s_cubic-bezier(0.16,1,0.3,1)_both] pb-28 lg:pb-0"
        >
          {renderStep()}
        </div>
        {currentStepId !== "intro" && <BookingSummary state={state} estimate={estimate} />}
      </div>
      {currentStepId !== "intro" && <MobileSummaryBar state={state} estimate={estimate} />}
    </div>
  );
}

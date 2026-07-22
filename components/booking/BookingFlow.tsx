"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BATHROOM_OPTIONS,
  BEDROOM_OPTIONS,
  EDIT_GROUP_END_STEPS,
  SQUARE_FOOTAGE_OPTIONS,
  STEP_STAGE,
} from "@/lib/booking/config";
import { calculateEstimate } from "@/lib/booking/calculate";
import {
  initialBookingState,
  STEP_ORDER,
  type AccessId,
  type ArrivalWindowId,
  type BathroomId,
  type BedroomId,
  type CleaningTypeId,
  type ExtrasState,
  type FrequencyId,
  type PropertyTypeId,
  type SquareFootageId,
  type StepId,
} from "@/lib/booking/types";
import ProgressIndicator from "@/components/booking/ProgressIndicator";
import BookingSummary from "@/components/booking/BookingSummary";
import MobileSummaryBar from "@/components/booking/MobileSummaryBar";
import CustomEstimateNotice from "@/components/booking/CustomEstimateNotice";
import StepTransition from "@/components/booking/StepTransition";
import IntroStep from "@/components/booking/steps/IntroStep";
import PropertyTypeStep from "@/components/booking/steps/PropertyTypeStep";
import SquareFootageStep from "@/components/booking/steps/SquareFootageStep";
import BedroomsStep from "@/components/booking/steps/BedroomsStep";
import BathroomsStep from "@/components/booking/steps/BathroomsStep";
import CleaningTypeStep from "@/components/booking/steps/CleaningTypeStep";
import ExtrasStep from "@/components/booking/steps/ExtrasStep";
import FrequencyStep from "@/components/booking/steps/FrequencyStep";
import LocationStep from "@/components/booking/steps/LocationStep";
import ScheduleDateStep from "@/components/booking/steps/ScheduleDateStep";
import ArrivalWindowStep from "@/components/booking/steps/ArrivalWindowStep";
import CustomerNameStep from "@/components/booking/steps/CustomerNameStep";
import CustomerEmailStep from "@/components/booking/steps/CustomerEmailStep";
import CustomerPhoneStep from "@/components/booking/steps/CustomerPhoneStep";
import ServiceAddressStep from "@/components/booking/steps/ServiceAddressStep";
import AccessStep from "@/components/booking/steps/AccessStep";
import SpecialInstructionsStep from "@/components/booking/steps/SpecialInstructionsStep";
import ReviewStep from "@/components/booking/steps/ReviewStep";

const CUSTOM_ESTIMATE_MESSAGES: Record<"square-footage" | "bedrooms" | "bathrooms", string> = {
  "square-footage":
    "Your home is a bit larger than we can price instantly — let's put together a custom estimate for you.",
  bedrooms:
    "With that many bedrooms, we'd rather put together a custom estimate than guess at a price.",
  bathrooms:
    "With that many bathrooms, we'd rather put together a custom estimate than guess at a price.",
};

// Orchestrates the linear question flow: owns BookingState, advances or
// rewinds stepIndex, and branches into the custom-estimate stop screen
// whenever the current step's selection is out of instant-pricing range.
export default function BookingFlow() {
  const [state, setState] = useState(initialBookingState);

  const currentStepId = STEP_ORDER[state.stepIndex];
  const estimate = useMemo(() => calculateEstimate(state), [state]);

  const goBack = () => setState((s) => ({ ...s, stepIndex: Math.max(s.stepIndex - 1, 0) }));

  // Normally advances one step. But if the customer got here via a Review
  // "Edit" link (`returnToStepId` is set) and the step they're leaving is
  // the last step of that edit group (EDIT_GROUP_END_STEPS, see
  // config.ts), jump straight back to Review instead of continuing
  // linearly — see EDIT_GROUPS in config.ts for the group boundaries.
  // Known simplification: if the customer navigates Back past the start
  // of the group they're editing, `returnToStepId` stays set and they'll
  // still land back on Review once they reach any group's end step —
  // acceptable for this prototype since it never leaves them stuck, it
  // just means an unusual back-then-forward path can skip re-confirming
  // an intermediate group.
  const advance = () =>
    setState((s) => {
      const leavingStepId = STEP_ORDER[s.stepIndex];
      if (s.returnToStepId && EDIT_GROUP_END_STEPS.has(leavingStepId)) {
        return { ...s, stepIndex: STEP_ORDER.indexOf(s.returnToStepId), returnToStepId: null };
      }
      return { ...s, stepIndex: Math.min(s.stepIndex + 1, STEP_ORDER.length - 1) };
    });

  // Also clears `paymentPreviewShown` — if the customer edits something
  // after seeing the "coming in a later milestone" message, they should
  // be able to reach and press the final button again on their way back.
  const editSection = (stepId: StepId) =>
    setState((s) => ({
      ...s,
      stepIndex: STEP_ORDER.indexOf(stepId),
      returnToStepId: "review",
      paymentPreviewShown: false,
    }));

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

  // --- Milestone 2A: Location ---
  const setZipCode = (zip: string) => setState((s) => ({ ...s, zipCode: zip }));
  const setOutOfAreaMessage = (text: string) => setState((s) => ({ ...s, outOfAreaMessage: text }));

  // --- Schedule ---
  const selectAppointmentDate = (dateKey: string) => {
    setState((s) => ({ ...s, appointmentDate: dateKey }));
    advance();
  };
  const selectArrivalWindow = (id: ArrivalWindowId) => {
    setState((s) => ({ ...s, arrivalWindow: id }));
    advance();
  };

  // --- Customer info (client-side prototype state only) ---
  // Fields hold the raw typed value while the customer is still in the
  // field (trimming on every keystroke would strip a space they just
  // typed before they can type the next word). Leading/trailing
  // whitespace is trimmed when they confirm the field via Continue —
  // see the continueFrom* handlers below — so every downstream consumer
  // (Review, validation) always sees trimmed values.
  const setFirstName = (value: string) => setState((s) => ({ ...s, firstName: value }));
  const setLastName = (value: string) => setState((s) => ({ ...s, lastName: value }));
  const setEmail = (value: string) => setState((s) => ({ ...s, email: value }));
  const setPhone = (value: string) => setState((s) => ({ ...s, phone: value }));

  const continueFromName = () => {
    setState((s) => ({ ...s, firstName: s.firstName.trim(), lastName: s.lastName.trim() }));
    advance();
  };
  const continueFromEmail = () => {
    setState((s) => ({ ...s, email: s.email.trim() }));
    advance();
  };
  // Seeds the service-address ZIP from the location step's ZIP the first
  // time the customer reaches it (without overwriting one they've already
  // typed there themselves after going back and forth), then advances.
  // This is the only forward transition into "service-address", so
  // hooking it here covers every path — including returning via an
  // edited "Contact and address" section, which re-enters at
  // "customer-name" and flows through here the same way.
  const continueFromPhone = () => {
    setState((s) => ({ ...s, phone: s.phone.trim(), addressZip: s.addressZip || s.zipCode }));
    advance();
  };

  // --- Service address ---
  const setAddressStreet = (value: string) => setState((s) => ({ ...s, addressStreet: value }));
  const setAddressUnit = (value: string) => setState((s) => ({ ...s, addressUnit: value }));
  const setAddressCity = (value: string) => setState((s) => ({ ...s, addressCity: value }));
  const setAddressState = (value: string) => setState((s) => ({ ...s, addressState: value }));
  const setAddressZip = (value: string) => setState((s) => ({ ...s, addressZip: value }));
  const continueFromAddress = () => {
    setState((s) => ({
      ...s,
      addressStreet: s.addressStreet.trim(),
      addressUnit: s.addressUnit.trim(),
      addressCity: s.addressCity.trim(),
    }));
    advance();
  };

  // --- Access & instructions ---
  const selectSomeoneHome = (id: AccessId) => {
    setState((s) => ({ ...s, someoneHome: id }));
    advance();
  };
  const setSpecialInstructions = (value: string) => setState((s) => ({ ...s, specialInstructions: value }));

  // --- Review & policy ---
  const setAgreedToPolicy = (agreed: boolean) => setState((s) => ({ ...s, agreedToPolicy: agreed }));
  const submitPaymentPreview = () => setState((s) => ({ ...s, paymentPreviewShown: true }));

  const stage = STEP_STAGE[currentStepId];

  // Keep the customer oriented at the top of each new question, especially
  // on mobile where the sticky summary bar makes a mid-scroll jump-cut
  // disorienting. Respects prefers-reduced-motion via the global CSS rule.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStepId, state.customEstimateTrigger]);

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
      case "location":
        return (
          <LocationStep
            zipCode={state.zipCode}
            onZipChange={setZipCode}
            outOfAreaMessage={state.outOfAreaMessage}
            onOutOfAreaMessageChange={setOutOfAreaMessage}
            onContinue={advance}
            onBack={goBack}
          />
        );
      case "schedule-date":
        return (
          <ScheduleDateStep appointmentDate={state.appointmentDate} onSelect={selectAppointmentDate} onBack={goBack} />
        );
      case "arrival-window":
        return <ArrivalWindowStep value={state.arrivalWindow} onSelect={selectArrivalWindow} onBack={goBack} />;
      case "customer-name":
        return (
          <CustomerNameStep
            firstName={state.firstName}
            lastName={state.lastName}
            onFirstNameChange={setFirstName}
            onLastNameChange={setLastName}
            onContinue={continueFromName}
            onBack={goBack}
          />
        );
      case "customer-email":
        return (
          <CustomerEmailStep email={state.email} onChange={setEmail} onContinue={continueFromEmail} onBack={goBack} />
        );
      case "customer-phone":
        return <CustomerPhoneStep phone={state.phone} onChange={setPhone} onContinue={continueFromPhone} onBack={goBack} />;
      case "service-address":
        return (
          <ServiceAddressStep
            street={state.addressStreet}
            unit={state.addressUnit}
            city={state.addressCity}
            state={state.addressState}
            zip={state.addressZip}
            onStreetChange={setAddressStreet}
            onUnitChange={setAddressUnit}
            onCityChange={setAddressCity}
            onStateChange={setAddressState}
            onZipChange={setAddressZip}
            onContinue={continueFromAddress}
            onBack={goBack}
          />
        );
      case "access":
        return <AccessStep value={state.someoneHome} onSelect={selectSomeoneHome} onBack={goBack} />;
      case "special-instructions":
        return (
          <SpecialInstructionsStep
            value={state.specialInstructions}
            onChange={setSpecialInstructions}
            onContinue={advance}
            onBack={goBack}
          />
        );
      case "review":
        return (
          <ReviewStep
            state={state}
            estimate={estimate}
            onEdit={editSection}
            onAgreedChange={setAgreedToPolicy}
            onSubmitPreview={submitPaymentPreview}
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
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_360px] lg:gap-14">
        <div className="pb-32 lg:pb-0">
          <StepTransition transitionKey={`${currentStepId}-${state.customEstimateTrigger ?? "answering"}`}>
            {renderStep()}
          </StepTransition>
        </div>
        {currentStepId !== "intro" && <BookingSummary state={state} estimate={estimate} />}
      </div>
      {currentStepId !== "intro" && <MobileSummaryBar state={state} estimate={estimate} />}
    </div>
  );
}

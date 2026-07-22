"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { formatCurrency, formatDuration, type EstimateBreakdown } from "@/lib/booking/calculate";
import { getFrequencyOption } from "@/lib/booking/config";
import { getSummaryLines } from "@/lib/booking/summary";
import { formatReadableDate, getArrivalWindowOption } from "@/lib/booking/schedule";
import { getCityForZip, isValidZipFormat, isZipSupported } from "@/lib/booking/serviceArea";
import { formatUsPhone, isNonEmpty, isValidEmail, isValidUsPhone } from "@/lib/booking/validation";
import type { BookingState, StepId } from "@/lib/booking/types";
import StepShell from "@/components/booking/StepShell";

type ReviewStepProps = {
  state: BookingState;
  estimate: EstimateBreakdown | null;
  onEdit: (stepId: StepId) => void;
  onAgreedChange: (agreed: boolean) => void;
  onSubmitPreview: () => void;
  onBack: () => void;
};

type ReviewSectionProps = {
  title: string;
  onEdit: () => void;
  children: ReactNode;
};

function ReviewSection({ title, onEdit, children }: ReviewSectionProps) {
  return (
    <section className="rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-lg text-[#3B2F27]">{title}</h2>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded text-sm font-medium text-[#3B2F27] underline underline-offset-2 transition-colors duration-150 hover:text-[#6B5B4C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
        >
          Edit
        </button>
      </div>
      <dl className="mt-3 space-y-2">{children}</dl>
    </section>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs text-[#A9998A]">{label}</dt>
      <dd className="text-right text-sm font-medium text-[#3B2F27]">{value}</dd>
    </div>
  );
}

export default function ReviewStep({ state, estimate, onEdit, onAgreedChange, onSubmitPreview, onBack }: ReviewStepProps) {
  const lines = getSummaryLines(state);
  const propertyServiceLines = lines.filter((l) =>
    ["Property type", "Square footage", "Bedrooms", "Bathrooms", "Cleaning type"].includes(l.label),
  );
  const extrasLine = lines.find((l) => l.label === "Extras");
  const frequencyOption = state.frequency ? getFrequencyOption(state.frequency) : null;

  const city = getCityForZip(state.zipCode);
  const arrivalWindowOption = state.arrivalWindow ? getArrivalWindowOption(state.arrivalWindow) : null;

  const addressParts = [
    state.addressStreet,
    state.addressUnit,
    `${state.addressCity}, ${state.addressState} ${state.addressZip}`,
  ].filter((part) => part && part.trim().length > 0);

  const zipValid = isValidZipFormat(state.zipCode) && isZipSupported(state.zipCode);
  const addressZipValid = isValidZipFormat(state.addressZip) && isZipSupported(state.addressZip);

  const isComplete = Boolean(
    estimate &&
      state.propertyType &&
      state.squareFootage &&
      state.bedrooms &&
      state.bathrooms &&
      state.cleaningType &&
      state.frequency &&
      zipValid &&
      state.appointmentDate &&
      state.arrivalWindow &&
      isNonEmpty(state.firstName) &&
      isNonEmpty(state.lastName) &&
      isValidEmail(state.email) &&
      isValidUsPhone(state.phone) &&
      isNonEmpty(state.addressStreet) &&
      isNonEmpty(state.addressCity) &&
      isNonEmpty(state.addressState) &&
      addressZipValid &&
      state.someoneHome &&
      state.agreedToPolicy,
  );

  return (
    <StepShell question="Review your cleaning" onBack={onBack}>
      <div className="space-y-5">
        <ReviewSection title="Property and service" onEdit={() => onEdit("property-type")}>
          {propertyServiceLines.map((line) => (
            <ReviewLine key={line.label} label={line.label} value={line.value} />
          ))}
        </ReviewSection>

        <ReviewSection title="Extras" onEdit={() => onEdit("extras")}>
          <ReviewLine label="Extras" value={extrasLine?.value ?? "No extras"} />
        </ReviewSection>

        <ReviewSection title="Frequency" onEdit={() => onEdit("frequency")}>
          <ReviewLine label="Frequency" value={frequencyOption?.label ?? "—"} />
          {frequencyOption && frequencyOption.discount > 0 && (
            <ReviewLine label="Recurring discount" value={frequencyOption.discountLabel} />
          )}
        </ReviewSection>

        <ReviewSection title="Location" onEdit={() => onEdit("location")}>
          <ReviewLine label="Service area" value={city ? `${city}, NJ ${state.zipCode}` : state.zipCode || "—"} />
        </ReviewSection>

        <ReviewSection title="Schedule" onEdit={() => onEdit("schedule-date")}>
          <ReviewLine
            label="Appointment date"
            value={state.appointmentDate ? formatReadableDate(state.appointmentDate) : "—"}
          />
          <ReviewLine
            label="Arrival window"
            value={arrivalWindowOption ? `${arrivalWindowOption.label} (${arrivalWindowOption.timeRangeLabel})` : "—"}
          />
        </ReviewSection>

        <ReviewSection title="Contact and address" onEdit={() => onEdit("customer-name")}>
          <ReviewLine label="Name" value={`${state.firstName} ${state.lastName}`.trim() || "—"} />
          <ReviewLine label="Email" value={state.email || "—"} />
          <ReviewLine label="Mobile number" value={state.phone ? formatUsPhone(state.phone) : "—"} />
          <ReviewLine label="Service address" value={addressParts.length > 0 ? addressParts.join(", ") : "—"} />
        </ReviewSection>

        <ReviewSection title="Instructions" onEdit={() => onEdit("access")}>
          <ReviewLine
            label="Someone home?"
            value={state.someoneHome === "home" ? "Yes, someone will be home" : state.someoneHome === "not-home" ? "No, no one will be home" : "—"}
          />
          {state.specialInstructions.trim() && (
            <div>
              <dt className="text-xs text-[#A9998A]">Special instructions</dt>
              <dd className="mt-1 text-sm font-medium text-[#3B2F27]">{state.specialInstructions}</dd>
            </div>
          )}
        </ReviewSection>

        <div className="rounded-2xl border border-[#E7DECE] bg-white p-7 shadow-[0_4px_24px_-8px_rgba(59,47,39,0.12)]">
          <p className="font-heading text-4xl text-[#3B2F27]">
            {estimate ? formatCurrency(estimate.totalPrice) : "Custom estimate"}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-[#B9AC9B]">Estimated total</p>
          <p className="mt-3 text-sm text-[#6B5B4C]">
            {estimate ? formatDuration(estimate.totalDurationMinutes) : "Duration to be determined"}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E7DECE] bg-[#FBF7EF] p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#8A7A6B]">Before you book</p>
          <ul className="mt-3 space-y-2 text-sm text-[#6B5B4C]">
            <li>Payment will be processed after the cleaning according to BeLa Cleaning&rsquo;s payment policy.</li>
            <li>Free changes or cancellations are permitted up to 24 hours before the appointment.</li>
            <li>Appointment reminders will be sent before the scheduled cleaning.</li>
            <li>Payment will be handled securely when the Stripe milestone is completed.</li>
          </ul>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E7DECE] bg-white p-5">
          <input
            type="checkbox"
            checked={state.agreedToPolicy}
            onChange={(event) => onAgreedChange(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#C9BCA6] text-[#3B2F27] accent-[#3B2F27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27]"
          />
          <span className="text-sm text-[#3B2F27]">
            I have read and agree to the BeLa Cleaning{" "}
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-[#6B5B4C]"
              onClick={(event) => event.stopPropagation()}
            >
              Service Policy and Terms &amp; Conditions
            </Link>
            .
          </span>
        </label>

        {state.paymentPreviewShown ? (
          <div className="rounded-2xl border border-[#C9BCA6] bg-[#F1E9DC] p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3B2F27] text-white">
                <Check size={14} strokeWidth={3} aria-hidden="true" />
              </span>
              <div>
                <p className="font-heading text-lg text-[#3B2F27]">
                  Payment setup is coming in the next development milestone.
                </p>
                <p className="mt-1 text-sm text-[#6B5B4C]">
                  Preview only — nothing has been booked or charged, and no information has been saved or sent.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSubmitPreview}
            disabled={!isComplete}
            className="inline-flex w-full items-center justify-center rounded-full bg-[#3B2F27] px-8 py-4 text-base font-medium tracking-wide text-white transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:bg-[#2A211C] hover:shadow-[0_16px_32px_-12px_rgba(59,47,39,0.4)] active:translate-y-0 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none sm:w-auto"
          >
            Continue to Secure Payment
          </button>
        )}
      </div>
    </StepShell>
  );
}

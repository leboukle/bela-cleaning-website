"use client";

import Link from "next/link";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { formatCurrency, formatDuration, type EstimateBreakdown } from "@/lib/booking/calculate";
import { getFrequencyOption } from "@/lib/booking/config";
import { getSummaryLines } from "@/lib/booking/summary";
import { formatReadableDate, getArrivalWindowOption } from "@/lib/booking/schedule";
import { getCityForZip, isValidZipFormat, isZipSupported } from "@/lib/booking/serviceArea";
import { formatUsPhone, isNonEmpty, isValidEmail, isValidUsPhone } from "@/lib/booking/validation";
import type { BookingState, StepId } from "@/lib/booking/types";
import type { BookingSubmissionUiState } from "@/lib/booking/submissionState";
import StepShell from "@/components/booking/StepShell";

type ReviewStepProps = {
  state: BookingState;
  estimate: EstimateBreakdown | null;
  onEdit: (stepId: StepId) => void;
  onAgreedChange: (agreed: boolean) => void;
  submission: BookingSubmissionUiState;
  onSubmit: () => void;
  onPickNewDate: () => void;
  honeypot: string;
  onHoneypotChange: (value: string) => void;
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

export default function ReviewStep({
  state,
  estimate,
  onEdit,
  onAgreedChange,
  submission,
  onSubmit,
  onPickNewDate,
  honeypot,
  onHoneypotChange,
  onBack,
}: ReviewStepProps) {
  const lines = getSummaryLines(state);
  const propertyLines = lines.filter((l) => ["Property type", "Square footage"].includes(l.label));
  const cleaningLines = lines.filter((l) => ["Bedrooms", "Bathrooms", "Cleaning type"].includes(l.label));
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
      <p className="mb-6 text-[15px] text-[#8A7A6B]">
        Here&rsquo;s everything we&rsquo;ve put together for your visit. Take a look, and change anything
        you&rsquo;d like before continuing.
      </p>
      <div className="space-y-5">
        <ReviewSection title="Property" onEdit={() => onEdit("property-type")}>
          {propertyLines.map((line) => (
            <ReviewLine key={line.label} label={line.label} value={line.value} />
          ))}
        </ReviewSection>

        <ReviewSection title="Cleaning" onEdit={() => onEdit("bedrooms")}>
          {cleaningLines.map((line) => (
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

        <ReviewSection title="Appointment" onEdit={() => onEdit("location")}>
          <ReviewLine label="Service area" value={city ? `${city}, NJ ${state.zipCode}` : state.zipCode || "—"} />
          <ReviewLine
            label="Appointment date"
            value={state.appointmentDate ? formatReadableDate(state.appointmentDate) : "—"}
          />
          <ReviewLine
            label="Arrival window"
            value={arrivalWindowOption ? `${arrivalWindowOption.label} (${arrivalWindowOption.timeRangeLabel})` : "—"}
          />
        </ReviewSection>

        <ReviewSection title="Contact" onEdit={() => onEdit("customer-name")}>
          <ReviewLine label="Name" value={`${state.firstName} ${state.lastName}`.trim() || "—"} />
          <ReviewLine label="Email" value={state.email || "—"} />
          <ReviewLine label="Mobile number" value={state.phone ? formatUsPhone(state.phone) : "—"} />
          <ReviewLine label="Service address" value={addressParts.length > 0 ? addressParts.join(", ") : "—"} />
        </ReviewSection>

        <ReviewSection title="Special Instructions" onEdit={() => onEdit("access")}>
          <ReviewLine
            label="Someone home?"
            value={state.someoneHome === "home" ? "Yes, someone will be home" : state.someoneHome === "not-home" ? "No, no one will be home" : "—"}
          />
          {state.specialInstructions.trim() && (
            <div>
              <dt className="text-xs text-[#A9998A]">Notes for your cleaner</dt>
              <dd className="mt-1 text-sm font-medium text-[#3B2F27]">{state.specialInstructions}</dd>
            </div>
          )}
        </ReviewSection>

        <div className="rounded-2xl border border-[#E7DECE] bg-white p-7 shadow-[0_4px_24px_-8px_rgba(59,47,39,0.12)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#A9998A]">Estimated total</p>
          <p className="mt-2 font-heading text-5xl leading-none text-[#3B2F27]">
            {estimate ? formatCurrency(estimate.totalPrice) : "Custom estimate"}
          </p>
          <p className="mt-4 text-sm text-[#6B5B4C]">
            {estimate ? `Estimated duration: ${formatDuration(estimate.totalDurationMinutes)}` : "Duration to be determined"}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E7DECE] bg-[#FBF7EF] p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#8A7A6B]">Before you book</p>
          <ul className="mt-3 space-y-2 text-sm text-[#6B5B4C]">
            <li>Every visit is completed by a professional, background-checked member of our team.</li>
            <li>Transparent pricing, no hidden fees — the total above is exactly what you&rsquo;ll pay.</li>
            <li>We&rsquo;ll confirm your appointment and send a reminder before we arrive.</li>
            <li>
              Plans change — reschedule or cancel free of charge up to 24 hours before your visit. Payment is
              collected securely after your cleaning.
            </li>
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

        {/* Honeypot: invisible to real customers (off-screen, unfocusable,
            hidden from assistive tech) but present in the DOM for bots
            that auto-fill every field. A non-empty value here causes the
            server to reject the submission — see validateSubmission.ts. */}
        <div className="absolute h-0 w-0 overflow-hidden" aria-hidden="true">
          <label htmlFor="company-website">Company website</label>
          <input
            id="company-website"
            name="company-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(event) => onHoneypotChange(event.target.value)}
          />
        </div>

        {submission.status === "success" ? (
          <div className="rounded-2xl border border-[#C9BCA6] bg-[#F1E9DC] p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3B2F27] text-white">
                <Check size={14} strokeWidth={3} aria-hidden="true" />
              </span>
              <div>
                <p className="font-heading text-lg text-[#3B2F27]">Your booking request has been received.</p>
                <p className="mt-1 text-sm text-[#6B5B4C]">
                  Booking ID <span className="font-medium text-[#3B2F27]">{submission.bookingId}</span> for{" "}
                  {formatReadableDate(submission.serviceDate)}, {submission.arrivalWindow}. Estimated total{" "}
                  {formatCurrency(submission.totalPrice)} ({formatDuration(submission.estimatedDurationMinutes)}).
                </p>
                <p className="mt-2 text-sm text-[#6B5B4C]">
                  Your status is <span className="font-medium text-[#3B2F27]">Pending Payment</span> — nothing has
                  been charged. We&rsquo;ll be in touch to confirm details and arrange payment.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {submission.status === "date-unavailable" && (
              <div className="flex items-start gap-3 rounded-2xl border border-[#D9A05B] bg-[#FBF0DE] p-5">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#9C6B23]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-[#3B2F27]">{submission.message}</p>
                  <button
                    type="button"
                    onClick={onPickNewDate}
                    className="mt-2 rounded text-sm font-medium text-[#3B2F27] underline underline-offset-2 hover:text-[#6B5B4C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
                  >
                    Choose a different date
                  </button>
                </div>
              </div>
            )}
            {submission.status === "error" && (
              <div className="flex items-start gap-3 rounded-2xl border border-[#C97B63] bg-[#FBEAE4] p-5">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#B14A2E]" aria-hidden="true" />
                <p className="text-sm font-medium text-[#3B2F27]">{submission.message}</p>
              </div>
            )}
            <button
              type="button"
              onClick={onSubmit}
              disabled={!isComplete || submission.status === "submitting"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#3B2F27] px-8 py-4 text-base font-medium tracking-wide text-white transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:bg-[#2A211C] hover:shadow-[0_16px_32px_-12px_rgba(59,47,39,0.4)] active:translate-y-0 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none sm:w-auto"
            >
              {submission.status === "submitting" && (
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              )}
              {submission.status === "submitting" ? "Submitting…" : "Submit Booking Request"}
            </button>
          </>
        )}
      </div>
    </StepShell>
  );
}

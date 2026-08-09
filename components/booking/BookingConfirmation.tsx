"use client";

import { Check } from "lucide-react";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import { getCleaningTypeOption, getFrequencyOption } from "@/lib/booking/config";
import { formatReadableDate } from "@/lib/booking/schedule";
import { businessConfig } from "@/lib/config";
import type { BookingState } from "@/lib/booking/types";

type BookingConfirmationSubmission = {
  bookingId: string;
  serviceDate: string;
  arrivalWindow: string;
  totalPrice: number;
  estimatedDurationMinutes: number;
};

type BookingConfirmationProps = {
  state: BookingState;
  submission: BookingConfirmationSubmission;
};

// Only the 5 states this prototype's service area ever offers (US_STATES
// in config.ts) — kept local rather than added to that approved list,
// since this is purely a display concern for this one component.
const STATE_ABBREVIATIONS: Record<string, string> = {
  "New Jersey": "NJ",
  "New York": "NY",
  Pennsylvania: "PA",
  Connecticut: "CT",
  Delaware: "DE",
};

function abbreviateState(state: string): string {
  return STATE_ABBREVIATIONS[state] ?? state;
}

const WHAT_HAPPENS_NEXT = [
  "We received your cleaning request.",
  "Your booking details are being held under your Booking ID.",
  "You'll receive confirmation and appointment communications at the email and mobile number you provided.",
  "Changes and cancellations remain subject to the BeLa Cleaning Service Policy.",
];

export default function BookingConfirmation({ state, submission }: BookingConfirmationProps) {
  const cleaningTypeLabel = state.cleaningType ? getCleaningTypeOption(state.cleaningType).label : "—";
  const frequencyOption = state.frequency ? getFrequencyOption(state.frequency) : null;
  const isRecurring = Boolean(frequencyOption && frequencyOption.id !== "one-time");

  const extraLabels: string[] = [];
  if (!state.extras.noExtras) {
    if (state.extras.kitchenCabinets) extraLabels.push("Inside kitchen cabinets");
    if (state.extras.refrigerator) extraLabels.push("Inside refrigerator");
    if (state.extras.oven) extraLabels.push("Inside oven");
    if (state.extras.interiorWindowsQty > 0) extraLabels.push(`Interior windows × ${state.extras.interiorWindowsQty}`);
    if (state.extras.blindsQty > 0) extraLabels.push(`Blinds × ${state.extras.blindsQty}`);
  }

  const addressLine = [
    state.addressStreet,
    state.addressUnit,
    `${state.addressCity}, ${abbreviateState(state.addressState)} ${state.addressZip}`,
  ]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#C9BCA6] bg-[#F1E9DC] p-7">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3B2F27] text-white">
            <Check size={16} strokeWidth={3} aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-heading text-2xl text-[#3B2F27]">Booking request received</h1>
            <p className="mt-1 text-sm text-[#6B5B4C]">
              Booking ID <span className="font-medium text-[#3B2F27]">{submission.bookingId}</span> — please keep
              this for your records.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
        <h2 className="font-heading text-lg text-[#3B2F27]">Your visit</h2>
        <dl className="mt-3 space-y-2">
          <ConfirmationLine label="First name" value={state.firstName || "—"} />
          <ConfirmationLine label="Cleaning type" value={cleaningTypeLabel} />
          <ConfirmationLine label="Service date" value={formatReadableDate(submission.serviceDate)} />
          <ConfirmationLine label="Arrival window" value={submission.arrivalWindow} />
          <ConfirmationLine label="Service address" value={addressLine || "—"} />
          <ConfirmationLine label="Estimated duration" value={formatDuration(submission.estimatedDurationMinutes)} />
          <ConfirmationLine label="Estimated total" value={formatCurrency(submission.totalPrice)} />
          {isRecurring && frequencyOption && <ConfirmationLine label="Frequency" value={frequencyOption.label} />}
          {extraLabels.length > 0 && <ConfirmationLine label="Extras" value={extraLabels.join(", ")} />}
        </dl>
      </div>

      <div className="rounded-2xl border border-[#E7DECE] bg-[#FBF7EF] p-6">
        <p className="text-sm text-[#6B5B4C]">
          Your booking request has been received and your Booking ID above is your reference for it. Payment has not
          yet been processed — no charge has been made and no card information has been collected. You&rsquo;ll
          receive the appropriate next-step communication once your appointment and payment are ready to be
          finalized.
        </p>
      </div>

      <div className="rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
        <h2 className="font-heading text-lg text-[#3B2F27]">What happens next</h2>
        <ol className="mt-3 space-y-2 text-sm text-[#6B5B4C]">
          {WHAT_HAPPENS_NEXT.map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="shrink-0 font-medium text-[#3B2F27]">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-center text-sm text-[#8A7A6B]">
        Questions? Reach us at{" "}
        <a href={`mailto:${businessConfig.email}`} className="underline underline-offset-2 hover:text-[#6B5B4C]">
          {businessConfig.email}
        </a>{" "}
        or{" "}
        <a href={businessConfig.phoneHref} className="underline underline-offset-2 hover:text-[#6B5B4C]">
          {businessConfig.phoneDisplay}
        </a>
        .
      </p>
    </div>
  );
}

function ConfirmationLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs text-[#A9998A]">{label}</dt>
      <dd className="text-right text-sm font-medium text-[#3B2F27]">{value}</dd>
    </div>
  );
}

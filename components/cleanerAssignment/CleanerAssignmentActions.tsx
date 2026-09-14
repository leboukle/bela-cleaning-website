"use client";

import { useState } from "react";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import { businessConfig } from "@/lib/config";
import type { CleanerAssignmentView } from "@/lib/booking/server/cleanerAssignmentView";

type CleanerAssignmentActionsProps = {
  token: string;
  initialAssignment: CleanerAssignmentView;
};

const STATE_ABBREVIATIONS: Record<string, string> = {
  "New Jersey": "NJ",
  "New York": "NY",
  Pennsylvania: "PA",
  Connecticut: "CT",
  Delaware: "DE",
};

export default function CleanerAssignmentActions({ token, initialAssignment }: CleanerAssignmentActionsProps) {
  const [assignment, setAssignment] = useState(initialAssignment);
  const [submitting, setSubmitting] = useState<"accept" | "decline" | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const addressLine = [
    assignment.streetAddress,
    assignment.apartmentOrUnit,
    `${assignment.city}, ${STATE_ABBREVIATIONS[assignment.state] ?? assignment.state} ${assignment.zipCode}`,
  ]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");

  const payoutPercentLabel = `${Math.round(assignment.payoutPercentage * 100)}%`;

  async function respond(action: "accept" | "decline") {
    setSubmitting(action);
    setBanner(null);
    try {
      const res = await fetch(`/api/cleaner-assignment/${token}/${action}`, { method: "POST" });
      const body = await res.json();
      setBanner({ kind: body.ok ? "success" : "error", message: body.message ?? "Something went wrong. Please try again." });
      setAssignment((prev) => ({ ...prev, status: body.outcome === "accepted" ? "Accepted" : body.outcome === "declined" ? "Declined" : body.outcome === "expired" ? "Expired" : prev.status, canRespond: false }));
    } catch {
      setBanner({ kind: "error", message: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#C9BCA6] bg-[#F1E9DC] p-7">
        <h1 className="font-heading text-2xl text-[#3B2F27]">Cleaning assignment</h1>
        <p className="mt-1 text-sm text-[#6B5B4C]">
          Booking ID <span className="font-medium text-[#3B2F27]">{assignment.bookingId}</span> · {assignment.status}
        </p>
      </div>

      {banner && (
        <div
          className={`rounded-2xl border p-4 text-sm ${
            banner.kind === "success" ? "border-[#C9BCA6] bg-[#F1E9DC] text-[#3B2F27]" : "border-[#E3B7A6] bg-[#FBEEE8] text-[#B14A2E]"
          }`}
        >
          {banner.message}
        </div>
      )}

      <div className="rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
        <h2 className="font-heading text-lg text-[#3B2F27]">Job details</h2>
        <dl className="mt-3 space-y-2">
          <DetailLine label="Customer" value={assignment.customerFirstName} />
          <DetailLine label="Service address" value={addressLine || "—"} />
          <DetailLine label="Service date" value={assignment.serviceDateLabel} />
          <DetailLine label="Start time" value={assignment.scheduleDisplayLabel} />
          <DetailLine label="Estimated duration" value={formatDuration(assignment.estimatedDurationMinutes)} />
          <DetailLine label="Cleaning type" value={assignment.cleaningType} />
          <DetailLine label="Bedrooms / Bathrooms" value={`${assignment.bedrooms} / ${assignment.bathrooms}`} />
          <DetailLine label="Property" value={`${assignment.propertyType} · ${assignment.squareFootage}`} />
          {assignment.extras.length > 0 && <DetailLine label="Selected add-ons" value={assignment.extras.join(", ")} />}
          <DetailLine label="Access" value={assignment.someoneHome} />
        </dl>
        {assignment.specialInstructions && (
          <p className="mt-4 text-sm text-[#6B5B4C]">
            <span className="font-medium text-[#3B2F27]">Customer notes (access/parking/pets/other): </span>
            {assignment.specialInstructions}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
        <h2 className="font-heading text-lg text-[#3B2F27]">Payout</h2>
        <dl className="mt-3 space-y-2">
          <DetailLine label="Cleaning total" value={formatCurrency(assignment.cleaningTotal)} />
          <DetailLine label={`Your payout (${payoutPercentLabel})`} value={formatCurrency(assignment.payoutAmount)} />
        </dl>
      </div>

      {assignment.canRespond ? (
        <div className="rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
          <h2 className="font-heading text-lg text-[#3B2F27]">Respond to this assignment</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => respond("accept")}
              disabled={submitting !== null}
              className="rounded-full bg-[#1E5B3A] px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#164B2E] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E5B3A]"
            >
              {submitting === "accept" ? "Accepting…" : "Accept Assignment"}
            </button>
            <button
              type="button"
              onClick={() => respond("decline")}
              disabled={submitting !== null}
              className="rounded-full border-2 border-[#B14A2E] px-5 py-2.5 text-sm font-semibold text-[#B14A2E] transition-colors duration-150 hover:bg-[#FBEEE8] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B14A2E]"
            >
              {submitting === "decline" ? "Declining…" : "Decline Assignment"}
            </button>
          </div>
          <p className="mt-4 text-xs text-[#8A7A6B]">
            If your availability changes after accepting this assignment, please contact BeLa Cleaning directly.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E7DECE] bg-[#FBF7EF] p-6 text-sm text-[#6B5B4C]">
          {assignment.status === "Accepted" && "You've accepted this assignment. If your availability changes, please contact BeLa Cleaning directly."}
          {assignment.status === "Declined" && "You've declined this assignment."}
          {assignment.status === "Expired" && "This assignment's response window has passed. Please contact BeLa Cleaning directly."}
        </div>
      )}

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

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs text-[#A9998A]">{label}</dt>
      <dd className="text-right text-sm font-medium text-[#3B2F27]">{value}</dd>
    </div>
  );
}

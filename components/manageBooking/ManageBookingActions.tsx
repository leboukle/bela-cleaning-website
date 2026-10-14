"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import Calendar from "@/components/booking/Calendar";
import SelectionCard from "@/components/booking/SelectionCard";
import { formatCurrency, formatDuration } from "@/lib/booking/calculate";
import { formatExactTime, formatReadableDate } from "@/lib/booking/schedule";
import { businessConfig } from "@/lib/config";
import type { ManageBookingView } from "@/lib/booking/server/manageBookingView";

type ManageBookingActionsProps = {
  token: string;
  initialBooking: ManageBookingView;
  /** Deep link from an email: opens the matching confirmation (still requires an explicit confirm). */
  initialAction?: "cancel-one" | "stop" | null;
};

type Phase = "idle" | "cancel-confirm" | "stop-confirm" | "reschedule-pick";

const STATE_ABBREVIATIONS: Record<string, string> = {
  "New Jersey": "NJ",
  "New York": "NY",
  Pennsylvania: "PA",
  Connecticut: "CT",
  Delaware: "DE",
};

async function fetchBookingView(token: string): Promise<ManageBookingView | null> {
  try {
    const res = await fetch(`/api/manage-booking/${token}`);
    const body = await res.json();
    return body.ok ? (body.booking as ManageBookingView) : null;
  } catch {
    return null;
  }
}

export default function ManageBookingActions({ token, initialBooking, initialAction = null }: ManageBookingActionsProps) {
  const [booking, setBooking] = useState(initialBooking);
  const [phase, setPhase] = useState<Phase>(() => {
    if (initialAction === "cancel-one" && initialBooking.eligibility.canCancel) return "cancel-confirm";
    if (initialAction === "stop" && initialBooking.recurring?.canStop) return "stop-confirm";
    return "idle";
  });
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const [newDateKey, setNewDateKey] = useState<string | null>(null);
  const [newStartTime, setNewStartTime] = useState<string | null>(null);
  const [unavailableDateKeys, setUnavailableDateKeys] = useState<string[]>([]);
  const [availableStartTimes, setAvailableStartTimes] = useState<string[]>([]);
  const [startTimesLoading, setStartTimesLoading] = useState(false);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "reschedule-pick") return;
    let cancelled = false;
    fetch("/api/booking/availability")
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled && body.ok) setUnavailableDateKeys(Array.isArray(body.unavailableDateKeys) ? body.unavailableDateKeys : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [phase]);

  useEffect(() => {
    // No reset needed on the bail path: the render below already gates on
    // `newDateKey` before ever reading `availableStartTimes`, and picking
    // a new date re-runs this effect and overwrites stale results before
    // `startTimesLoading` ever goes false again.
    if (phase !== "reschedule-pick" || !newDateKey) return;
    let cancelled = false;

    (async () => {
      if (!cancelled) setStartTimesLoading(true);
      const params = new URLSearchParams({ date: newDateKey, durationMinutes: String(booking.estimatedDurationMinutes) });
      try {
        const res = await fetch(`/api/booking/available-times?${params.toString()}`);
        const body = await res.json();
        if (!cancelled && body.ok) setAvailableStartTimes(Array.isArray(body.availableStartTimes) ? body.availableStartTimes : []);
      } catch {
        // best-effort — leave availableStartTimes as-is on failure
      } finally {
        if (!cancelled) setStartTimesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, newDateKey, booking.estimatedDurationMinutes]);

  const addressLine = [
    booking.streetAddress,
    booking.apartmentOrUnit,
    `${booking.city}, ${STATE_ABBREVIATIONS[booking.state] ?? booking.state} ${booking.zipCode}`,
  ]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");

  async function handleConfirmCancel() {
    setCancelSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/manage-booking/${token}/cancel`, { method: "POST" });
      const body = await res.json();
      setBanner({ kind: body.ok ? "success" : "error", message: body.message ?? "Something went wrong. Please try again." });
      const refreshed = await fetchBookingView(token);
      if (refreshed) setBooking(refreshed);
      setPhase("idle");
    } catch {
      setBanner({ kind: "error", message: "Something went wrong. Please try again." });
    } finally {
      setCancelSubmitting(false);
    }
  }

  async function handleConfirmStop() {
    setStopSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/manage-booking/${token}/stop-recurring`, { method: "POST" });
      const body = await res.json();
      setBanner({ kind: body.ok ? "success" : "error", message: body.message ?? "Something went wrong. Please try again." });
      const refreshed = await fetchBookingView(token);
      if (refreshed) setBooking(refreshed);
      setPhase("idle");
    } catch {
      setBanner({ kind: "error", message: "Something went wrong. Please try again." });
    } finally {
      setStopSubmitting(false);
    }
  }

  async function handleConfirmReschedule() {
    if (!newDateKey || !newStartTime) return;
    setRescheduleSubmitting(true);
    setRescheduleError(null);
    try {
      const res = await fetch(`/api/manage-booking/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceDate: newDateKey, serviceStartTime: newStartTime }),
      });
      const body = await res.json();
      if (!body.ok) {
        setRescheduleError(body.message ?? "That date is no longer available. Please choose another.");
        return;
      }
      setBanner({ kind: "success", message: body.message ?? "Your booking has been rescheduled." });
      const refreshed = await fetchBookingView(token);
      if (refreshed) setBooking(refreshed);
      setPhase("idle");
      setNewDateKey(null);
      setNewStartTime(null);
    } catch {
      setRescheduleError("Something went wrong. Please try again.");
    } finally {
      setRescheduleSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#C9BCA6] bg-[#F1E9DC] p-7">
        <h1 className="font-heading text-2xl text-[#3B2F27]">Manage your booking</h1>
        <p className="mt-1 text-sm text-[#6B5B4C]">
          Booking ID <span className="font-medium text-[#3B2F27]">{booking.bookingId}</span> · {booking.displayStatus}
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
        <h2 className="font-heading text-lg text-[#3B2F27]">Your visit</h2>
        <dl className="mt-3 space-y-2">
          <DetailLine label="Cleaning type" value={booking.cleaningType} />
          <DetailLine label="Service date" value={formatReadableDate(booking.serviceDate)} />
          <DetailLine label="Appointment time" value={booking.scheduleDisplayLabel} />
          <DetailLine label="Service address" value={addressLine || "—"} />
          <DetailLine label="Estimated duration" value={formatDuration(booking.estimatedDurationMinutes)} />
          <DetailLine label="Total" value={formatCurrency(booking.totalPrice)} />
          {booking.frequency !== "One time" && <DetailLine label="Frequency" value={booking.frequency} />}
          {booking.extras.length > 0 && <DetailLine label="Extras" value={booking.extras.join(", ")} />}
        </dl>
      </div>


      {(booking.eligibility.canCancel || booking.eligibility.canReschedule) && phase === "idle" && (
        <div className="rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
          <h2 className="font-heading text-lg text-[#3B2F27]">Change your appointment</h2>
          {booking.eligibility.isLateWindow && (
            <p className="mt-2 flex items-start gap-2 text-sm text-[#B14A2E]">
              <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              This appointment is within 24 hours. Rescheduling online is no longer available — please contact us
              directly for changes. Cancelling now is subject to a late-cancellation fee.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {booking.eligibility.canReschedule && (
              <button
                type="button"
                onClick={() => setPhase("reschedule-pick")}
                className="rounded-full border-2 border-[#3B2F27] px-5 py-2.5 text-sm font-semibold text-[#3B2F27] transition-colors duration-150 hover:bg-[#F1E9DC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27]"
              >
                Reschedule
              </button>
            )}
            {booking.eligibility.canCancel && (
              <button
                type="button"
                onClick={() => setPhase("cancel-confirm")}
                className="rounded-full border-2 border-[#B14A2E] px-5 py-2.5 text-sm font-semibold text-[#B14A2E] transition-colors duration-150 hover:bg-[#FBEEE8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B14A2E]"
              >
                {booking.recurring ? "Cancel this cleaning only" : "Cancel booking"}
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "cancel-confirm" && (
        <div className="rounded-2xl border border-[#E3B7A6] bg-[#FBEEE8] p-6">
          <h2 className="font-heading text-lg text-[#3B2F27]">
            {booking.recurring ? "Cancel this cleaning only" : "Confirm cancellation"}
          </h2>
          {booking.recurring && (
            <p className="mt-2 text-sm text-[#3B2F27]">
              You are cancelling <span className="font-semibold">only</span> the cleaning on{" "}
              <span className="font-semibold">
                {formatReadableDate(booking.serviceDate)} at {booking.scheduleDisplayLabel}
              </span>{" "}
              ({formatCurrency(booking.totalPrice)}).{" "}
              {booking.recurring.nextRegularDate
                ? `Your recurring cleanings continue: your next regular cleaning will be scheduled for ${formatReadableDate(booking.recurring.nextRegularDate)}.`
                : "Your recurring cleanings continue."}
            </p>
          )}
          {booking.eligibility.isLateWindow && booking.eligibility.lateCancellationFeeCents !== null ? (
            <p className="mt-2 text-sm text-[#6B5B4C]">
              This appointment is within 24 hours of its scheduled start. Cancelling now is subject to a
              late-cancellation fee equal to 50% of your booking total —{" "}
              <span className="font-semibold text-[#3B2F27]">
                {formatCurrency(booking.eligibility.lateCancellationFeeCents / 100)}
              </span>{" "}
              — which will be charged to your saved payment method.
            </p>
          ) : (
            <p className="mt-2 text-sm text-[#6B5B4C]">
              This cancellation is free — you will not be charged.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleConfirmCancel}
              disabled={cancelSubmitting}
              className="rounded-full bg-[#B14A2E] px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#96402A] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B14A2E]"
            >
              {cancelSubmitting ? "Cancelling…" : booking.recurring ? "Yes, cancel this cleaning only" : "Yes, cancel my booking"}
            </button>
            <button
              type="button"
              onClick={() => setPhase("idle")}
              disabled={cancelSubmitting}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-[#6B5B4C] transition-colors duration-150 hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Never mind
            </button>
          </div>
        </div>
      )}

      {booking.recurring && phase === "idle" && (
        <div className="rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
          <h2 className="font-heading text-lg text-[#3B2F27]">Your recurring cleanings</h2>
          {booking.recurring.canStop ? (
            <>
              <p className="mt-2 text-sm text-[#6B5B4C]">
                {booking.recurring.frequency} cleanings are scheduled automatically and charged to your saved card one
                hour after each cleaning ends. Stopping ends the series — it is separate from cancelling a single
                cleaning.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setPhase("stop-confirm")}
                  className="rounded-full border-2 border-[#B14A2E] px-5 py-2.5 text-sm font-semibold text-[#B14A2E] transition-colors duration-150 hover:bg-[#FBEEE8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B14A2E]"
                >
                  Stop recurring cleanings
                </button>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-[#6B5B4C]">
              Your recurring cleanings have ended. No further cleanings will be scheduled.
            </p>
          )}
        </div>
      )}

      {phase === "stop-confirm" && booking.recurring && (
        <div className="rounded-2xl border border-[#E3B7A6] bg-[#FBEEE8] p-6">
          <h2 className="font-heading text-lg text-[#3B2F27]">Stop recurring cleanings</h2>
          <p className="mt-2 text-sm text-[#6B5B4C]">
            This ends your {booking.recurring.frequency.toLowerCase()} recurring cleanings. No further cleanings will
            be scheduled. Your booking and payment history are kept.
          </p>
          {booking.recurring.upcoming ? (
            <div className="mt-3 text-sm text-[#6B5B4C]">
              <p>
                Your upcoming cleaning on{" "}
                <span className="font-semibold text-[#3B2F27]">
                  {formatReadableDate(booking.recurring.upcoming.serviceDate)} at{" "}
                  {booking.recurring.upcoming.scheduleDisplayLabel}
                </span>{" "}
                ({formatCurrency(booking.recurring.upcoming.totalPrice)}) will be cancelled.
              </p>
              {booking.recurring.upcoming.isLateWindow && booking.recurring.upcoming.lateCancellationFeeCents !== null ? (
                <p className="mt-2">
                  That cleaning is within 24 hours, so a late-cancellation fee of{" "}
                  <span className="font-semibold text-[#3B2F27]">
                    {formatCurrency(booking.recurring.upcoming.lateCancellationFeeCents / 100)}
                  </span>{" "}
                  (50% of its total) will be charged to your saved payment method.
                </p>
              ) : (
                <p className="mt-2">This is more than 24 hours away, so cancelling it is free.</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#6B5B4C]">You have no upcoming cleaning to cancel, so nothing will be charged.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleConfirmStop}
              disabled={stopSubmitting}
              className="rounded-full bg-[#B14A2E] px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#96402A] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B14A2E]"
            >
              {stopSubmitting ? "Stopping…" : "Yes, stop recurring cleanings"}
            </button>
            <button
              type="button"
              onClick={() => setPhase("idle")}
              disabled={stopSubmitting}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-[#6B5B4C] transition-colors duration-150 hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Never mind
            </button>
          </div>
        </div>
      )}

      {phase === "reschedule-pick" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
            <h2 className="font-heading text-lg text-[#3B2F27]">Choose a new date</h2>
            <div className="mt-4">
              <Calendar
                selectedDateKey={newDateKey}
                onSelect={(dateKey) => {
                  setNewDateKey(dateKey);
                  setNewStartTime(null);
                }}
                unavailableDateKeys={unavailableDateKeys}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
            <h2 className="font-heading text-lg text-[#3B2F27]">Choose a new appointment time</h2>
            {!newDateKey && <p className="mt-3 text-sm text-[#8A7A6B]">Choose a date above first.</p>}
            {newDateKey && startTimesLoading && <p className="mt-3 text-sm text-[#8A7A6B]">Loading available times…</p>}
            {newDateKey && !startTimesLoading && availableStartTimes.length === 0 && (
              <p className="mt-3 text-sm text-[#B14A2E]">No appointment times are available on this date. Please choose another date.</p>
            )}
            {newDateKey && !startTimesLoading && availableStartTimes.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {availableStartTimes.map((time) => (
                  <SelectionCard
                    key={time}
                    label={formatExactTime(time)}
                    selected={newStartTime === time}
                    onSelect={() => setNewStartTime(time)}
                    role="radio"
                  />
                ))}
              </div>
            )}
          </div>

          {rescheduleError && (
            <p className="flex items-start gap-2 text-sm text-[#B14A2E]">
              <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {rescheduleError}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleConfirmReschedule}
              disabled={!newDateKey || !newStartTime || rescheduleSubmitting}
              className="flex items-center gap-2 rounded-full bg-[#3B2F27] px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#2A2019] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2F27]"
            >
              {rescheduleSubmitting ? (
                "Rescheduling…"
              ) : (
                <>
                  <Check size={15} strokeWidth={3} aria-hidden="true" />
                  Confirm new date
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setNewDateKey(null);
                setNewStartTime(null);
                setRescheduleError(null);
              }}
              disabled={rescheduleSubmitting}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-[#6B5B4C] transition-colors duration-150 hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!booking.eligibility.canCancel && !booking.eligibility.canReschedule && !booking.recurring?.canStop && phase === "idle" && (
        <div className="rounded-2xl border border-[#E7DECE] bg-[#FBF7EF] p-6 text-sm text-[#6B5B4C]">
          This booking can no longer be changed online. Please contact us directly if you need help.
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

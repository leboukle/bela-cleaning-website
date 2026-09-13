"use client";

import { useEffect, useState } from "react";
import SelectionCard from "@/components/booking/SelectionCard";
import StepShell from "@/components/booking/StepShell";
import { formatExactTime } from "@/lib/booking/schedule";

type StartTimeStepProps = {
  value: string | null;
  appointmentDate: string | null;
  estimatedDurationMinutes: number | null;
  onSelect: (time: string) => void;
  onBack: () => void;
};

// Milestone 6 amendment: replaces ArrivalWindowStep. The offered list of
// exact start times is never a static catalog — it's fetched live from
// /api/booking/available-times, which is operating-hours/duration
// filtered AND overlap/capacity-checked against the same authoritative
// Sheets data the server re-validates at submission time (see
// availability.ts's getAvailableStartTimes). This is purely a UX
// convenience; the server never trusts this list back.
export default function StartTimeStep({ value, appointmentDate, estimatedDurationMinutes, onSelect, onBack }: StartTimeStepProps) {
  const [availableStartTimes, setAvailableStartTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // Defensive only — BookingFlow never renders this step without both
    // already set (appointmentDate is chosen the step before, and
    // duration is already known by the time bedrooms/bathrooms/cleaning
    // type are answered, all earlier in STEP_ORDER). No state to reset
    // here since `availableStartTimes` already starts empty and `loading`
    // already starts false.
    if (!appointmentDate || !estimatedDurationMinutes) return;
    let cancelled = false;

    (async () => {
      if (!cancelled) {
        setLoading(true);
        setLoadError(false);
      }
      const params = new URLSearchParams({ date: appointmentDate, durationMinutes: String(estimatedDurationMinutes) });
      try {
        const res = await fetch(`/api/booking/available-times?${params.toString()}`);
        const body = await res.json();
        if (cancelled) return;
        if (body.ok) {
          setAvailableStartTimes(Array.isArray(body.availableStartTimes) ? body.availableStartTimes : []);
        } else {
          setLoadError(true);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appointmentDate, estimatedDurationMinutes]);

  return (
    <StepShell
      question="What time works best?"
      note="Choose an exact appointment start time — your cleaner will arrive then."
      onBack={onBack}
    >
      {loading && <p className="text-sm text-[#8A7A6B]">Loading available times…</p>}
      {!loading && loadError && (
        <p className="text-sm text-[#B14A2E]">
          We couldn&rsquo;t load available times. Please go back and try again.
        </p>
      )}
      {!loading && !loadError && availableStartTimes.length === 0 && (
        <p className="text-sm text-[#B14A2E]">
          No appointment times are available on this date. Please go back and choose another date.
        </p>
      )}
      {!loading && !loadError && availableStartTimes.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {availableStartTimes.map((time) => (
            <SelectionCard key={time} label={formatExactTime(time)} selected={value === time} onSelect={() => onSelect(time)} role="radio" />
          ))}
        </div>
      )}
    </StepShell>
  );
}

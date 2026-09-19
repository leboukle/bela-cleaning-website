"use client";

import { useEffect, useRef, useState } from "react";
import { filterStartTimesByDuration } from "@/lib/booking/schedule";

type UseAppointmentRevalidationArgs = {
  appointmentDate: string | null;
  serviceStartTime: string | null;
  /** The recalculated total from the centralized estimate; null while a custom-quote trigger is active. */
  durationMinutes: number | null;
  /** Called when the selected time can no longer be kept. The caller clears it and tells the customer. */
  onInvalidated: () => void;
};

type VerifiedAppointment = { date: string; time: string; durationMinutes: number };

// A start time was chosen (or last verified) against an earlier, shorter
// duration. Once a selection changes the estimate upward (square footage,
// cleaning type, extras, the Standard -> Deep switch, ...), this re-checks
// the customer's ALREADY-SELECTED appointment against the new duration
// instead of letting them reach final submission with a time that no
// longer fits.
//
// Two layers, both reusing existing centralized logic:
//   1. Immediate, no network: the same duration/8:00 PM rule the server's
//      availability code applies (schedule.ts's filterStartTimesByDuration).
//      This is exact for "would now finish after 8:00 PM".
//   2. Debounced, best-effort: the existing /api/booking/available-times
//      endpoint (availability.ts's getAvailableStartTimes — blackout,
//      overlap/capacity, lead time). A longer visit can newly collide with
//      other bookings. If that call fails or is throttled the selection is
//      simply kept: the server's checkExactTimeAvailability at submission
//      remains the final authority and race-condition guard.
//
// It only ever acts on an INCREASE beyond the duration the current
// appointment was last verified at. A decrease can't make a valid time
// invalid, so a still-valid appointment is never cleared (or changed) just
// because the estimate changed. It never picks a different time — it only
// reports that the current one is no longer valid.
const REVALIDATION_DEBOUNCE_MS = 350;

export function useAppointmentRevalidation({
  appointmentDate,
  serviceStartTime,
  durationMinutes,
  onInvalidated,
}: UseAppointmentRevalidationArgs) {
  // The appointment + the (largest) duration it is currently known to fit.
  const [verified, setVerified] = useState<VerifiedAppointment | null>(null);
  const onInvalidatedRef = useRef(onInvalidated);

  useEffect(() => {
    onInvalidatedRef.current = onInvalidated;
  });

  // State adjusted during render (React's "derive state from props" pattern):
  // a newly selected appointment is adopted as verified at the duration it
  // was chosen under (the start-time step only offers times valid for the
  // current duration), and clearing the selection forgets it.
  if (appointmentDate && serviceStartTime && durationMinutes != null) {
    if (!verified || verified.date !== appointmentDate || verified.time !== serviceStartTime) {
      setVerified({ date: appointmentDate, time: serviceStartTime, durationMinutes });
    }
  } else if (verified && (!appointmentDate || !serviceStartTime)) {
    setVerified(null);
  }

  const needsCheck =
    verified !== null &&
    appointmentDate === verified.date &&
    serviceStartTime === verified.time &&
    durationMinutes != null &&
    durationMinutes > verified.durationMinutes;
  const fitsByDuration =
    needsCheck && serviceStartTime !== null && durationMinutes !== null
      ? filterStartTimesByDuration([serviceStartTime], durationMinutes).length === 1
      : true;

  useEffect(() => {
    if (!needsCheck || !appointmentDate || !serviceStartTime || durationMinutes == null) return;

    // Layer 1: exact duration / 8:00 PM finish rule, no network.
    if (!fitsByDuration) {
      onInvalidatedRef.current();
      return;
    }

    // Layer 2: best-effort live availability check, debounced so rapid
    // extras toggles collapse into one request.
    let cancelled = false;
    const checked: VerifiedAppointment = { date: appointmentDate, time: serviceStartTime, durationMinutes };
    const timer = setTimeout(async () => {
      let stillListed = true;
      try {
        const params = new URLSearchParams({ date: checked.date, durationMinutes: String(checked.durationMinutes) });
        const res = await fetch(`/api/booking/available-times?${params.toString()}`);
        const body = await res.json();
        if (body?.ok === true && Array.isArray(body.availableStartTimes)) {
          stillListed = body.availableStartTimes.includes(checked.time);
        }
      } catch {
        // Unknown — keep the selection; the server re-validates on submit.
      }
      if (cancelled) return;
      if (stillListed) setVerified(checked);
      else onInvalidatedRef.current();
    }, REVALIDATION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needsCheck, fitsByDuration, appointmentDate, serviceStartTime, durationMinutes]);

  return {
    /** True while a live availability check for the CURRENT selection is still pending (debounce + request). */
    isChecking: needsCheck && fitsByDuration,
  };
}

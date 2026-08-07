"use client";

import { useEffect, useState } from "react";
import Calendar from "@/components/booking/Calendar";
import StepShell from "@/components/booking/StepShell";
import { formatReadableDate } from "@/lib/booking/schedule";

type ScheduleDateStepProps = {
  appointmentDate: string | null;
  onSelect: (dateKey: string) => void;
  onBack: () => void;
};

export default function ScheduleDateStep({ appointmentDate, onSelect, onBack }: ScheduleDateStepProps) {
  const [unavailableDateKeys, setUnavailableDateKeys] = useState<string[]>([]);
  const [loadError, setLoadError] = useState(false);

  // One request covers the whole bookable window (the endpoint runs a
  // constant number of Sheets reads regardless of range size — see
  // getUnavailableDateKeysInWindow), so there's no need to re-fetch as the
  // customer flips between months.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/booking/availability")
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body.ok) {
          setUnavailableDateKeys(Array.isArray(body.unavailableDateKeys) ? body.unavailableDateKeys : []);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <StepShell
      question="When would you like us to visit?"
      note="We're here seven days a week. Appointments open up starting one week out, and you can browse as far as six months ahead."
      onBack={onBack}
    >
      <Calendar selectedDateKey={appointmentDate} onSelect={onSelect} unavailableDateKeys={unavailableDateKeys} />
      {loadError && (
        <p className="mt-4 text-sm text-[#B14A2E]">
          We couldn&rsquo;t load live availability — some fully-booked dates may still appear selectable. We&rsquo;ll
          confirm your date is available when you submit.
        </p>
      )}
      {appointmentDate && (
        <p className="mt-4 text-sm font-medium text-[#6B5B4C]">
          Selected: <span className="text-[#3B2F27]">{formatReadableDate(appointmentDate)}</span>
        </p>
      )}
    </StepShell>
  );
}

"use client";

import { useMemo } from "react";
import Calendar from "@/components/booking/Calendar";
import StepShell from "@/components/booking/StepShell";
import { formatReadableDate, getMockUnavailableDateKeys } from "@/lib/booking/schedule";

type ScheduleDateStepProps = {
  appointmentDate: string | null;
  onSelect: (dateKey: string) => void;
  onBack: () => void;
};

export default function ScheduleDateStep({ appointmentDate, onSelect, onBack }: ScheduleDateStepProps) {
  // DEV-ONLY MOCK DATA: stands in for real per-day capacity, which needs a
  // database (a later milestone). See getMockUnavailableDateKeys' own
  // comment in lib/booking/schedule.ts for what to remove once that
  // exists — nothing here needs to change beyond that call site.
  const unavailableDateKeys = useMemo(() => getMockUnavailableDateKeys(), []);

  return (
    <StepShell
      question="When would you like us to visit?"
      note="We're here seven days a week. Appointments open up starting one week out, and you can browse as far as six months ahead."
      onBack={onBack}
    >
      <Calendar selectedDateKey={appointmentDate} onSelect={onSelect} unavailableDateKeys={unavailableDateKeys} />
      {appointmentDate && (
        <p className="mt-4 text-sm font-medium text-[#6B5B4C]">
          Selected: <span className="text-[#3B2F27]">{formatReadableDate(appointmentDate)}</span>
        </p>
      )}
    </StepShell>
  );
}

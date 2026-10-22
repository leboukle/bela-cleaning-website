"use client";

import { Info } from "lucide-react";
import { SERVICE_CLOSURE_MESSAGE } from "@/lib/booking/serviceClosures";

// The one place the customer-facing closure wording is rendered. The wording
// itself lives in lib/booking/serviceClosures.ts next to the dates it
// describes, and is the same string the server returns when it rejects a
// closed date.
export default function ServiceClosureNotice({ className = "" }: { className?: string }) {
  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-2xl border border-[#D9A05B] bg-[#FBF0DE] p-4 ${className}`}
    >
      <Info size={18} className="mt-0.5 shrink-0 text-[#9C6B23]" aria-hidden="true" />
      <p className="text-sm font-medium leading-relaxed text-[#3B2F27]">{SERVICE_CLOSURE_MESSAGE}</p>
    </div>
  );
}

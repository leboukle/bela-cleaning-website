"use client";

import { Clock, ShieldCheck, Sparkles } from "lucide-react";

type IntroStepProps = {
  onStart: () => void;
};

const REASSURANCES = [
  { icon: Clock, label: "Takes about 2 minutes" },
  { icon: Sparkles, label: "See your price as you go" },
  { icon: ShieldCheck, label: "No obligation to book" },
];

export default function IntroStep({ onStart }: IntroStepProps) {
  return (
    <div className="max-w-xl py-4 sm:py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8A7A6B]">BeLa Cleaning</p>
      <h1 className="mt-4 font-heading text-[2.5rem] leading-[1.1] text-[#3B2F27] text-balance sm:text-5xl">
        You&rsquo;re just a few steps away from a cleaner home.
      </h1>
      <p className="mt-5 text-base leading-relaxed text-[#6B5B4C] sm:text-lg">
        Tell us a little about your home, and we&rsquo;ll build a cleaning service tailored to your
        needs — with a live price and appointment length that update as you go.
      </p>

      <ul className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-6">
        {REASSURANCES.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-2 text-sm text-[#8A7A6B]">
            <Icon size={16} className="shrink-0 text-[#C9BCA6]" aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onStart}
        className="mt-9 inline-flex items-center justify-center rounded-full bg-[#3B2F27] px-9 py-4 text-base font-medium tracking-wide text-white transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:bg-[#2A211C] hover:shadow-[0_16px_32px_-12px_rgba(59,47,39,0.4)] active:translate-y-0 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3B2F27]"
      >
        Let&rsquo;s Get Started
      </button>

      <p className="mt-5 text-xs text-[#A9998A]">
        This is a preview of BeLa Cleaning&rsquo;s upcoming booking experience. No appointment is
        created and no information is saved yet.
      </p>
    </div>
  );
}

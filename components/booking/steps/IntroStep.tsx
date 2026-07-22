"use client";

type IntroStepProps = {
  onStart: () => void;
};

export default function IntroStep({ onStart }: IntroStepProps) {
  return (
    <div className="max-w-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8A7A6B]">
        BeLa Cleaning
      </p>
      <h1 className="mt-3 font-heading text-4xl sm:text-5xl leading-tight text-[#3B2F27] text-balance">
        Let&rsquo;s build your cleaning service.
      </h1>
      <p className="mt-5 text-base sm:text-lg text-[#6B5B4C] leading-relaxed">
        Answer a few simple questions about your property and what you&rsquo;d like done. We&rsquo;ll
        put together a running estimate as you go, so you can see your price and appointment length
        update in real time before you book.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-8 inline-flex items-center justify-center rounded-full bg-[#3B2F27] px-8 py-3.5 text-sm font-medium tracking-wide text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2A211C] hover:shadow-lg active:translate-y-0 active:scale-[0.97]"
      >
        Get Started
      </button>
      <p className="mt-4 text-xs text-[#A9998A]">
        This is a preview of BeLa Cleaning&rsquo;s upcoming booking experience. No appointment is
        created and no information is saved yet.
      </p>
    </div>
  );
}

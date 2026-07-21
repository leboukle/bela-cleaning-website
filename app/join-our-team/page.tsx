import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/seo";
import SectionHeading from "@/components/SectionHeading";
import ResponsiveImageSection from "@/components/ResponsiveImageSection";
import CleanerApplicationForm from "@/components/CleanerApplicationForm";
import Reveal from "@/components/Reveal";
import { images } from "@/lib/images";

export const metadata: Metadata = buildPageMetadata({
  title: "Join the BeLa Cleaning Team",
  description:
    "Join the BeLa Cleaning team as a dependable residential cleaning professional serving Jersey City, Hoboken, and Newark. Apply online today to get started.",
  path: "/join-our-team",
});

const values = [
  "Dependability",
  "Professional communication",
  "Attention to detail",
  "Punctuality",
  "Respect for customers and their homes",
  "Ability to follow service instructions",
  "Pride in consistent work",
];

export default function JoinOurTeamPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-deep-green uppercase mb-4">
              Join Our Team
            </p>
            <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl leading-[1.05] text-charcoal text-balance">
              Interested in joining the BeLa Cleaning Team?
            </h1>
            <p className="mt-6 text-base sm:text-lg text-warm-text leading-relaxed">
              We&rsquo;re always interested in hearing from dependable residential
              cleaning professionals who take pride in their work, communicate
              clearly, and treat every home with care and respect.
            </p>
            <p className="mt-4 text-base sm:text-lg text-warm-text leading-relaxed">
              This page is for cleaners interested in potential cleaning
              opportunities with BeLa Cleaning.
            </p>
          </div>
          <ResponsiveImageSection
            image={images.workWithUsHero}
            aspectClassName="aspect-[5/4]"
            priority
          />
        </div>
      </section>

      {/* What We Value (dark architectural break) */}
      <section className="bg-charcoal py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <SectionHeading title="What We Value" dark />
          </Reveal>
          <Reveal>
            <p className="mt-10 flex flex-wrap items-baseline gap-x-3 gap-y-4 font-heading text-2xl sm:text-3xl leading-relaxed text-pure-white">
              {values.map((value, index) => (
                <span key={value} className="flex items-baseline gap-3">
                  {value}
                  {index < values.length - 1 && (
                    <span className="text-sage" aria-hidden="true">
                      /
                    </span>
                  )}
                </span>
              ))}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Application Form */}
      <section className="py-16 sm:py-20 border-t border-soft-gray">
        <div className="mx-auto max-w-2xl px-6">
          <SectionHeading title="Tell us about your experience and availability." />
          <div className="mt-10">
            <CleanerApplicationForm />
          </div>

          <p className="mt-8 text-sm text-warm-text leading-relaxed">
            BeLa Cleaning uses the information submitted through this form to review
            potential cleaning professionals and communicate about possible opportunities.
            Submission does not guarantee assignments or a position. Read our{" "}
            <Link
              href="/privacy"
              className="text-deep-green underline underline-offset-2 hover:text-charcoal"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}

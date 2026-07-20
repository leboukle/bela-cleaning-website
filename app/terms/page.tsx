import type { Metadata } from "next";
import SectionHeading from "@/components/SectionHeading";
import { businessConfig } from "@/lib/config";

// DEVELOPER NOTE: Legal content requires review and finalization before
// public launch. The copy below is a concise, honest placeholder and does
// not claim attorney review or make specific contractual commitments.
export const metadata: Metadata = {
  title: { absolute: "Terms of Service | BeLa Cleaning" },
  description: `Terms of service placeholder for ${businessConfig.businessName}.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeading eyebrow="Legal" title="Terms of Service" as="h1" />
        <div className="mt-8 space-y-5 text-warm-text leading-relaxed">
          <p>
            This page is a placeholder. BeLa Cleaning&rsquo;s final Terms of Service will
            describe the terms that apply to using this website and booking services
            through BeLa Cleaning&rsquo;s online booking platform, including scheduling,
            rescheduling, and cancellation policies.
          </p>
          <p>
            Final, legally reviewed terms will be published here before this website is
            publicly launched.
          </p>
          <p>
            If you have a question in the meantime, contact BeLa Cleaning at{" "}
            <a
              href={`mailto:${businessConfig.email}`}
              className="text-deep-green underline underline-offset-2 hover:text-charcoal"
            >
              {businessConfig.email}
            </a>{" "}
            or{" "}
            <a
              href={businessConfig.phoneHref}
              className="text-deep-green underline underline-offset-2 hover:text-charcoal"
            >
              {businessConfig.phoneDisplay}
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

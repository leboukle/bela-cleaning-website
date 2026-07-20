import type { Metadata } from "next";
import SectionHeading from "@/components/SectionHeading";
import { businessConfig } from "@/lib/config";

// DEVELOPER NOTE: Legal content requires review and finalization before
// public launch. The copy below is a concise, honest placeholder and
// intentionally avoids describing specific data practices or protections
// that have not yet been confirmed by counsel.
export const metadata: Metadata = {
  title: { absolute: "Privacy Policy | BeLa Cleaning" },
  description: `Privacy policy placeholder for ${businessConfig.businessName}.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeading eyebrow="Legal" title="Privacy Policy" as="h1" />
        <div className="mt-8 space-y-5 text-warm-text leading-relaxed">
          <p>
            This page is a placeholder. BeLa Cleaning&rsquo;s final Privacy Policy will
            describe what information is collected through this website and the online
            booking platform, how it is used, and the choices available to visitors and
            customers.
          </p>
          <p>
            Final, legally reviewed privacy language will be published here before this
            website is publicly launched.
          </p>
          <p>
            If you have a question about your information in the meantime, contact BeLa
            Cleaning at{" "}
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

import type { Metadata } from "next";
import { Check } from "lucide-react";
import { buildPageMetadata } from "@/lib/seo";
import SectionHeading from "@/components/SectionHeading";
import PrimaryButton from "@/components/PrimaryButton";
import ResponsiveImageSection from "@/components/ResponsiveImageSection";
import FAQAccordion from "@/components/FAQAccordion";
import CustomerServiceBlock from "@/components/CustomerServiceBlock";
import CTASection from "@/components/CTASection";
import Reveal from "@/components/Reveal";
import { businessConfig, CTA_LABEL } from "@/lib/config";
import { services, addOns } from "@/lib/services";
import { faqs } from "@/lib/faqs";

export const metadata: Metadata = buildPageMetadata({
  title: "Residential Cleaning Services | BeLa Cleaning",
  description:
    "Explore standard, deep, and move-in/move-out cleaning services in Jersey City, Hoboken, Newark, and surrounding areas. Transparent pricing, no contracts.",
  path: "/services",
});

const servicesJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  serviceType: "Residential Cleaning",
  provider: {
    "@type": "LocalBusiness",
    name: businessConfig.businessName,
    url: businessConfig.websiteUrl,
  },
  areaServed: ["Jersey City", "Hoboken", "Newark"],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Residential Cleaning Services",
    itemListElement: services.map((service) => ({
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: service.name,
        description: service.description,
      },
    })),
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

const preparationChecklist = [
  "Put away personal or highly valuable items",
  "Clear excessive clutter from surfaces and floors",
  "Secure pets as needed",
  "Provide complete entry instructions",
  "Identify priority areas before the appointment",
  "Confirm parking or building-access details when relevant",
];

export default function ServicesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(servicesJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* A. Services Hero */}
      <section className="pt-20 pb-16 sm:pt-28 sm:pb-20">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading
            eyebrow="Residential Cleaning Services"
            title="Choose the clean your home needs."
            supporting="From routine upkeep to a detailed reset, BeLa Cleaning makes it easy to select your service and book online with clear pricing."
            as="h1"
          />
          <p className="mt-4 max-w-2xl text-sm text-warm-text leading-relaxed">
            Choose your service and home details to see your running total through the
            online booking process. Standard available services do not require a
            separate quote request.
          </p>
          <div className="mt-8">
            <PrimaryButton href={businessConfig.bookingUrl}>{CTA_LABEL}</PrimaryButton>
          </div>
        </div>
      </section>

      {/* B-D. Service detail sections */}
      {services.map((service, index) => {
        const imageFirst = index % 2 === 1;
        return (
          <section key={service.slug} className="py-16 sm:py-20 border-t border-soft-gray">
            <div className="mx-auto max-w-7xl px-6 grid gap-12 lg:grid-cols-2 lg:items-center">
              <Reveal className={imageFirst ? "lg:order-2" : ""}>
                <ResponsiveImageSection
                  image={service.image}
                  aspectClassName="aspect-[5/4]"
                />
              </Reveal>
              <Reveal className={imageFirst ? "lg:order-1" : ""}>
                <h2 className="font-heading text-4xl sm:text-5xl leading-[1.05] text-charcoal">
                  {service.name}
                </h2>
                <p className="mt-4 text-warm-text leading-relaxed">{service.description}</p>

                <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-deep-green">
                  Typical focus areas
                </h3>
                <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {service.focusAreas.map((area) => (
                    <li key={area} className="flex items-start gap-2 text-charcoal">
                      <Check size={16} className="mt-1 shrink-0 text-deep-green" aria-hidden="true" />
                      <span>{area}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-5 text-sm text-warm-text">{service.note}</p>

                <div className="mt-7">
                  <PrimaryButton href={businessConfig.bookingUrl}>{CTA_LABEL}</PrimaryButton>
                </div>
              </Reveal>
            </div>
          </section>
        );
      })}

      {/* E. Add-Ons (dark architectural break) */}
      <section className="bg-charcoal py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading
            title="Add the details your home needs."
            align="center"
            className="mx-auto"
            dark
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {addOns.map((addOn) => (
              <div
                key={addOn}
                className="border border-white/15 px-5 py-4 text-sm font-medium text-soft-gray"
              >
                {addOn}
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-2xl mx-auto text-center text-sm text-soft-gray/70">
            Availability and pricing are shown during booking. Select only the services and
            add-ons currently available through BeLa Cleaning&rsquo;s online booking platform.
          </p>
        </div>
      </section>

      {/* F. Preparing for Your Cleaning */}
      <section className="py-16 sm:py-20 border-t border-soft-gray">
        <div className="mx-auto max-w-3xl px-6">
          <SectionHeading
            title="A few simple preparations help us focus on cleaning."
            align="center"
            className="mx-auto"
          />
          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {preparationChecklist.map((item) => (
              <li key={item} className="flex items-start gap-2 text-charcoal">
                <Check size={16} className="mt-1 shrink-0 text-deep-green" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* G. FAQ */}
      <section className="py-16 sm:py-20 border-t border-soft-gray">
        <div className="mx-auto max-w-3xl px-6">
          <SectionHeading title="Frequently asked questions." align="center" className="mx-auto" />
          <div className="mt-10">
            <FAQAccordion items={faqs} />
          </div>
        </div>
      </section>

      {/* H. Customer-Service Contact Block */}
      <div className="border-t border-soft-gray">
        <CustomerServiceBlock />
      </div>

      {/* I. Services Final CTA */}
      <CTASection
        headline="Ready to take cleaning off your list?"
        copy="Choose your service and schedule online in minutes."
      />
    </>
  );
}

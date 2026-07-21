import Image from "next/image";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { buildPageMetadata } from "@/lib/seo";
import SectionHeading from "@/components/SectionHeading";
import PrimaryButton from "@/components/PrimaryButton";
import TrustRow from "@/components/TrustRow";
import ServiceCard from "@/components/ServiceCard";
import ResponsiveImageSection from "@/components/ResponsiveImageSection";
import TestimonialCard from "@/components/TestimonialCard";
import CustomerServiceBlock from "@/components/CustomerServiceBlock";
import CTASection from "@/components/CTASection";
import Reveal from "@/components/Reveal";
import { businessConfig, CTA_LABEL } from "@/lib/config";
import { images } from "@/lib/images";
import { services } from "@/lib/services";
import { testimonials } from "@/lib/testimonials";

export const metadata: Metadata = buildPageMetadata({
  title: "BeLa Cleaning | Residential House Cleaning in Jersey City",
  description:
    "Book residential house cleaning online in Jersey City, Hoboken, and Newark. Transparent pricing, no contracts, and easy online booking with BeLa Cleaning.",
  path: "/",
  image: images.homeHero,
});

const steps = [
  {
    number: "01",
    title: "Choose Your Cleaning",
    copy: "Select your home size, service, frequency, and available add-ons while your running total updates as you book.",
  },
  {
    number: "02",
    title: "Pick Your Time",
    copy: "Choose an available date and appointment window online.",
  },
  {
    number: "03",
    title: "Come Home to Clean",
    copy: "Our team completes the service so you can return to a refreshed home.",
  },
];

const expectations = [
  {
    title: "Clear selections",
    copy: "Choose the service and available options that match your home.",
  },
  {
    title: "Upfront total",
    copy: "Review the running total before confirming your appointment.",
  },
  {
    title: "Professional communication",
    copy: "Receive clear booking and appointment information.",
  },
  {
    title: "Respectful service",
    copy: "Your home is treated with care, attention, and professionalism.",
  },
];

const whyBela = [
  {
    title: "Easy Online Booking",
    copy: "Choose the service that fits your home, see your running total as you make selections, and book an available appointment without requesting a quote.",
  },
  {
    title: "Clear, Transparent Pricing",
    copy: "See the selected service total before confirming. No quote request, unnecessary back-and-forth, long-term contract, or hidden fee.",
  },
  {
    title: "Local and Dependable",
    copy: "BeLa Cleaning is locally owned and focused on reliable service, clear communication, and consistent professional standards.",
  },
];

const professionalFeatures = [
  "Book at any time",
  "Choose services online",
  "See your total before confirming",
  "Manage your appointment through the booking platform",
];

const heroBenefits = [
  "Transparent Pricing",
  "No Contracts",
  "No Hidden Fees",
  "Online Booking 24/7",
];

export default function HomePage() {
  return (
    <>
      {/* 1. Hero */}
      <section className="relative flex min-h-[94vh] items-center overflow-hidden bg-charcoal">
        <Image
          src={images.homeHero.src}
          alt={images.homeHero.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-charcoal/95 via-charcoal/65 to-charcoal/15"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-transparent to-transparent"
          aria-hidden="true"
        />
        <div className="relative mx-auto w-full max-w-7xl px-6 py-28 sm:py-36">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.22em] text-soft-gray uppercase mb-5">
              Residential Cleaning for Busy Lives
            </p>
            <h1 className="font-heading text-2xl sm:text-4xl md:text-5xl lg:text-6xl leading-tight text-pure-white">
              {heroBenefits.map((benefit, index) => (
                <span
                  key={benefit}
                  className={`flex items-center gap-3 sm:gap-4 whitespace-nowrap ${
                    index > 0 ? "mt-2 sm:mt-3" : ""
                  }`}
                >
                  <Check
                    className="h-6 w-6 sm:h-8 sm:w-8 lg:h-10 lg:w-10 shrink-0"
                    aria-hidden="true"
                    strokeWidth={2.5}
                  />
                  <span>{benefit}</span>
                </span>
              ))}
            </h1>

            <div className="mt-8 max-w-md">
              <p className="text-base sm:text-lg text-soft-gray/90 leading-relaxed">
                High-quality residential cleaning with dependable service for busy
                homeowners and professionals.
              </p>

              <div className="mt-6 border-t border-pure-white/20 pt-6">
                <p className="font-heading text-xl sm:text-2xl text-pure-white">
                  See your price as you book.
                </p>
                <p className="mt-3 text-sm sm:text-base text-soft-gray/85 leading-relaxed">
                  Select your home details and services to view your running total
                  instantly. Pricing updates based on the options you choose.
                </p>
              </div>

              <p className="mt-4 text-sm text-soft-gray/80">
                Instant pricing for standard bookings.
              </p>
            </div>

            <p className="mt-5 text-sm text-soft-gray/80">
              Serving Jersey City, Hoboken, Newark, and nearby communities.
            </p>
            <div className="mt-8">
              <PrimaryButton href={businessConfig.bookingUrl}>{CTA_LABEL}</PrimaryButton>
            </div>
            <TrustRow light className="mt-8" />
          </div>
        </div>
      </section>

      {/* 2. How It Works */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <SectionHeading
              eyebrow="How It Works"
              title="A cleaner home in three simple steps."
            />
          </Reveal>
          <div className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-3 md:divide-x md:divide-soft-gray">
            {steps.map((step, index) => (
              <Reveal key={step.number}>
                <div className={index > 0 ? "md:pl-10" : ""}>
                  <span className="font-heading text-6xl sm:text-7xl text-sage/70">
                    {step.number}
                  </span>
                  <h3 className="mt-4 font-heading text-2xl text-charcoal">{step.title}</h3>
                  <p className="mt-2 max-w-xs text-warm-text leading-relaxed">{step.copy}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-12 flex justify-center">
            <PrimaryButton href={businessConfig.bookingUrl} className="w-full sm:w-auto">
              {CTA_LABEL}
            </PrimaryButton>
          </div>
        </div>
      </section>

      {/* 3. What to Expect */}
      <section className="py-20 sm:py-28 border-t border-soft-gray">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <SectionHeading
              title="Clear from booking through completion."
              align="center"
              className="mx-auto"
            />
          </Reveal>
          <div className="mt-14 grid grid-cols-1 border-t border-l border-soft-gray sm:grid-cols-2">
            {expectations.map((item, index) => (
              <Reveal key={item.title}>
                <div className="h-full border-r border-b border-soft-gray p-8">
                  <span className="font-heading text-sm text-sage">
                    0{index + 1}
                  </span>
                  <h3 className="mt-2 font-heading text-xl text-charcoal">{item.title}</h3>
                  <p className="mt-2 text-warm-text leading-relaxed">{item.copy}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-12 flex justify-center">
            <PrimaryButton href={businessConfig.bookingUrl} className="w-full sm:w-auto">
              {CTA_LABEL}
            </PrimaryButton>
          </div>
        </div>
      </section>

      {/* 4. Why BeLa (dark architectural break) */}
      <section className="bg-charcoal py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <SectionHeading
              eyebrow="Why BeLa"
              title="Everything you need. None of the runaround."
              dark
            />
          </Reveal>
          <div className="mt-14 divide-y divide-white/10 border-t border-white/10">
            {whyBela.map((item) => (
              <Reveal key={item.title}>
                <div className="grid gap-2 py-8 sm:grid-cols-3 sm:gap-10">
                  <h3 className="font-heading text-xl text-pure-white sm:col-span-1">
                    {item.title}
                  </h3>
                  <p className="text-soft-gray/80 leading-relaxed sm:col-span-2">{item.copy}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-12">
            <PrimaryButton href={businessConfig.bookingUrl} className="w-full sm:w-auto">
              {CTA_LABEL}
            </PrimaryButton>
          </div>
        </div>
      </section>

      {/* 5. Services */}
      <section className="py-20 sm:py-28 border-t border-soft-gray">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <SectionHeading
              eyebrow="Our Services"
              title="Care designed around your home."
              align="center"
              className="mx-auto"
            />
          </Reveal>
          <div className="mt-14 grid gap-8 lg:grid-cols-12">
            <Reveal className="lg:col-span-7">
              <ServiceCard
                service={services[0]}
                priority
                aspectClassName="aspect-[4/3] lg:aspect-[16/13]"
                titleClassName="text-2xl"
              />
            </Reveal>
            <div className="flex flex-col gap-8 lg:col-span-5">
              {services.slice(1).map((service) => (
                <Reveal key={service.slug}>
                  <ServiceCard service={service} aspectClassName="aspect-[16/10]" />
                </Reveal>
              ))}
            </div>
          </div>
          <div className="mt-12 flex justify-center">
            <PrimaryButton href={businessConfig.bookingUrl}>{CTA_LABEL}</PrimaryButton>
          </div>
        </div>
      </section>

      {/* 6. Busy Professionals (full-bleed dark architectural break) */}
      <section className="relative overflow-hidden">
        <div className="relative min-h-[70vh] flex items-center">
          <Image
            src={images.busyProfessionals.src}
            alt={images.busyProfessionals.alt}
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div
            className="absolute inset-0 bg-gradient-to-l from-charcoal/95 via-charcoal/60 to-charcoal/10"
            aria-hidden="true"
          />
          <div className="relative mx-auto w-full max-w-7xl px-6 py-20 sm:py-28">
            <div className="ml-auto max-w-lg text-right">
              <Reveal>
                <h2 className="font-heading text-4xl sm:text-5xl md:text-6xl leading-[1.05] text-pure-white text-balance">
                  Your time belongs somewhere else.
                </h2>
                <p className="mt-5 text-base sm:text-lg text-soft-gray/80 leading-relaxed">
                  Whether you are commuting into Manhattan, working from home, managing a
                  family, or simply protecting your weekend, BeLa Cleaning helps keep your
                  home handled without adding another task to your schedule.
                </p>
                <ul className="mt-6 space-y-3">
                  {professionalFeatures.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center justify-end gap-2 text-soft-gray/90"
                    >
                      <span>{feature}</span>
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-sage"
                        aria-hidden="true"
                      />
                    </li>
                  ))}
                </ul>
                <div className="mt-8 flex justify-end">
                  <PrimaryButton href={businessConfig.bookingUrl}>{CTA_LABEL}</PrimaryButton>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Service Area */}
      <section className="py-20 sm:py-28 border-t border-soft-gray">
        <div className="mx-auto max-w-7xl px-6 grid gap-12 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <SectionHeading
              title="Proudly serving our neighborhood."
              supporting="BeLa Cleaning provides residential cleaning throughout Jersey City, Hoboken, Newark, and selected nearby communities."
            />
            <ul className="mt-6 flex flex-wrap gap-3">
              {businessConfig.serviceAreas.map((area) => (
                <li
                  key={area}
                  className="rounded-full border border-soft-gray px-4 py-1.5 text-sm text-charcoal"
                >
                  {area}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-warm-text leading-relaxed">
              Not sure whether your address is within our service area? Email{" "}
              <a
                href={`mailto:${businessConfig.email}`}
                className="text-deep-green underline underline-offset-2 hover:text-charcoal"
              >
                {businessConfig.email}
              </a>{" "}
              or call{" "}
              <a
                href={businessConfig.phoneHref}
                className="text-deep-green underline underline-offset-2 hover:text-charcoal"
              >
                {businessConfig.phoneDisplay}
              </a>
              .
            </p>
            <div className="mt-8">
              <PrimaryButton href={businessConfig.bookingUrl} className="w-full sm:w-auto">
                {CTA_LABEL}
              </PrimaryButton>
            </div>
          </Reveal>
          <Reveal>
            <ResponsiveImageSection image={images.serviceArea} aspectClassName="aspect-[5/4]" />
          </Reveal>
        </div>
      </section>

      {/* 8. Testimonials */}
      <section className="py-20 sm:py-28 border-t border-soft-gray">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <SectionHeading
              title="A service people feel good coming home to."
              align="center"
              className="mx-auto"
            />
          </Reveal>
          {/*
            DEVELOPER NOTE: Verified customer testimonials have not yet been
            supplied. The cards below render placeholder content from
            lib/testimonials.ts. Replace the entries in that file with real,
            verified testimonials before public launch.
          */}
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <Reveal key={testimonial.quote}>
                <TestimonialCard testimonial={testimonial} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 9. Customer-Service Contact Block */}
      {/*
        DEVELOPER NOTE: No additional Book Cleaning button is added directly
        beneath this block. The Final CTA section immediately follows with
        no other content between them, so inserting one here would place
        two booking buttons within the same mobile viewport.
      */}
      <div className="border-t border-soft-gray">
        <CustomerServiceBlock />
      </div>

      {/* 10. Final CTA */}
      <CTASection
        headline="Your cleaner home starts here."
        copy="Book online in minutes and leave the cleaning to BeLa."
      />
    </>
  );
}

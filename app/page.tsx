import Image from "next/image";
import type { Metadata } from "next";
import { CalendarCheck, Receipt, ShieldCheck } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import PrimaryButton from "@/components/PrimaryButton";
import TrustRow from "@/components/TrustRow";
import BenefitCard from "@/components/BenefitCard";
import ServiceCard from "@/components/ServiceCard";
import ResponsiveImageSection from "@/components/ResponsiveImageSection";
import TestimonialCard from "@/components/TestimonialCard";
import CTASection from "@/components/CTASection";
import Reveal from "@/components/Reveal";
import { businessConfig, CTA_LABEL } from "@/lib/config";
import { images } from "@/lib/images";
import { services } from "@/lib/services";
import { testimonials } from "@/lib/testimonials";

export const metadata: Metadata = {
  title: {
    absolute: "BeLa Cleaning | Residential Cleaning in Jersey City, Hoboken & Newark",
  },
  description:
    "Book dependable residential cleaning online with transparent pricing and no contracts. BeLa Cleaning serves Jersey City, Hoboken, Newark, and nearby communities.",
  alternates: { canonical: "/" },
};

const benefits = [
  {
    icon: CalendarCheck,
    title: "Easy Online Booking",
    copy: "Choose the service that fits your home, see your total as you book, and select an available appointment online.",
  },
  {
    icon: Receipt,
    title: "Clear, Transparent Pricing",
    copy: "Know what your selected cleaning costs before confirming. No contracts, hidden fees, or unnecessary quoting process.",
  },
  {
    icon: ShieldCheck,
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

const steps = [
  {
    number: "01",
    title: "Choose Your Cleaning",
    copy: "Select the service, home size, frequency, and any available add-ons.",
  },
  {
    number: "02",
    title: "Pick Your Time",
    copy: "Choose an available date and appointment window online.",
  },
  {
    number: "03",
    title: "Come Home to Clean",
    copy: "Our team completes the service so you can return to a home that feels refreshed and cared for.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* A. Home Hero */}
      <section className="relative flex min-h-[88vh] items-center overflow-hidden bg-charcoal">
        <Image
          src={images.homeHero.src}
          alt={images.homeHero.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-charcoal/85 via-charcoal/45 to-charcoal/20"
          aria-hidden="true"
        />
        <div className="relative mx-auto w-full max-w-7xl px-6 py-32 sm:py-40">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.18em] text-soft-gray uppercase mb-4">
              Residential Cleaning for Busy Lives
            </p>
            <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl leading-[1.08] text-pure-white text-balance">
              Come home to beautifully handled.
            </h1>
            <p className="mt-6 max-w-xl text-base sm:text-lg text-soft-gray leading-relaxed">
              High-quality residential cleaning with transparent pricing, dependable
              service, and online booking in minutes. Serving Jersey City, Hoboken,
              Newark, and nearby communities.
            </p>
            <div className="mt-8">
              <PrimaryButton href={businessConfig.bookingUrl}>{CTA_LABEL}</PrimaryButton>
            </div>
            <TrustRow light className="mt-8" />
          </div>
        </div>
      </section>

      {/* B. Introduction */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 grid gap-12 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <SectionHeading
              title="A cleaner home without the back-and-forth."
              supporting="Your schedule is already full. BeLa Cleaning makes residential cleaning simple from the start. Choose your service, see your running total, and schedule online without waiting for a quote or spending time on the phone."
            />
          </Reveal>
          <Reveal>
            <ResponsiveImageSection image={images.introInterior} aspectClassName="aspect-[5/4]" />
          </Reveal>
        </div>
      </section>

      {/* C. Why BeLa */}
      <section className="py-20 sm:py-28 bg-pure-white">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <SectionHeading
              eyebrow="Why BeLa"
              title="Professional care, made uncomplicated."
              align="center"
              className="mx-auto"
            />
          </Reveal>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit) => (
              <Reveal key={benefit.title}>
                <BenefitCard {...benefit} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* D. Services Preview */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <SectionHeading
              eyebrow="Our Services"
              title="The right clean for the way you live."
              align="center"
              className="mx-auto"
            />
          </Reveal>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {services.map((service, index) => (
              <Reveal key={service.slug}>
                <ServiceCard service={service} priority={index === 0} />
              </Reveal>
            ))}
          </div>
          <div className="mt-12 flex justify-center">
            <PrimaryButton href={businessConfig.bookingUrl}>{CTA_LABEL}</PrimaryButton>
          </div>
        </div>
      </section>

      {/* E. Busy Professionals */}
      <section className="py-20 sm:py-28 bg-pure-white">
        <div className="mx-auto max-w-7xl px-6 grid gap-12 lg:grid-cols-2 lg:items-center">
          <Reveal className="order-2 lg:order-1">
            <ResponsiveImageSection
              image={images.busyProfessionals}
              aspectClassName="aspect-[5/4]"
            />
          </Reveal>
          <Reveal className="order-1 lg:order-2">
            <SectionHeading
              title="Your time belongs somewhere else."
              supporting="Whether you are commuting into Manhattan, working from home, managing a family, or simply protecting your weekend, BeLa Cleaning helps keep your home handled without adding another task to your schedule."
            />
            <ul className="mt-6 space-y-3">
              {professionalFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-charcoal">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-deep-green" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <PrimaryButton href={businessConfig.bookingUrl}>{CTA_LABEL}</PrimaryButton>
            </div>
          </Reveal>
        </div>
      </section>

      {/* F. How It Works */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <SectionHeading
              eyebrow="How It Works"
              title="From booking to beautifully clean."
              align="center"
              className="mx-auto"
            />
          </Reveal>
          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            {steps.map((step) => (
              <Reveal key={step.number}>
                <div className="text-center sm:text-left">
                  <span className="font-heading text-3xl text-sage">{step.number}</span>
                  <h3 className="mt-3 font-heading text-xl text-charcoal">{step.title}</h3>
                  <p className="mt-2 text-warm-text leading-relaxed">{step.copy}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* G. Service Area */}
      <section className="py-20 sm:py-28 bg-pure-white">
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
          </Reveal>
          <Reveal>
            <ResponsiveImageSection image={images.serviceArea} aspectClassName="aspect-[5/4]" />
          </Reveal>
        </div>
      </section>

      {/* H. Testimonials */}
      <section className="py-20 sm:py-28">
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
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <Reveal key={testimonial.quote}>
                <TestimonialCard testimonial={testimonial} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* I. Home Final CTA */}
      <CTASection
        headline="Your cleaner home starts here."
        copy="Book online in minutes and leave the cleaning to BeLa."
      />
    </>
  );
}

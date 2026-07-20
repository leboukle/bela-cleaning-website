import type { Metadata } from "next";
import SectionHeading from "@/components/SectionHeading";
import PrimaryButton from "@/components/PrimaryButton";
import ResponsiveImageSection from "@/components/ResponsiveImageSection";
import ContactDetails from "@/components/ContactDetails";
import ContactForm from "@/components/ContactForm";
import CTASection from "@/components/CTASection";
import Reveal from "@/components/Reveal";
import { businessConfig, CTA_LABEL } from "@/lib/config";
import { images } from "@/lib/images";

export const metadata: Metadata = {
  title: { absolute: "About BeLa Cleaning | Local Residential Cleaning" },
  description:
    "Learn about BeLa Cleaning, a locally owned residential cleaning company serving Jersey City, Hoboken, Newark, and nearby communities.",
  alternates: { canonical: "/about" },
};

const standards = [
  {
    title: "Reliability",
    copy: "We take scheduling, communication, and follow-through seriously.",
  },
  {
    title: "Clarity",
    copy: "Services and available options should be easy to understand before you book.",
  },
  {
    title: "Respect",
    copy: "Every home should be treated carefully, professionally, and without judgment.",
  },
  {
    title: "Consistency",
    copy: "Our processes are designed to support a dependable experience from booking through completion.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* A. About Hero */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-deep-green uppercase mb-3">
              About BeLa Cleaning
            </p>
            <h1 className="font-heading text-4xl sm:text-5xl leading-tight text-charcoal text-balance">
              Local service. Professional standards. A simpler way to book.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-warm-text leading-relaxed">
              BeLa Cleaning was created to make dependable residential cleaning easier for
              busy people across Jersey City, Hoboken, Newark, and nearby communities.
            </p>
          </div>
          <ResponsiveImageSection image={images.aboutHero} aspectClassName="aspect-[5/4]" priority />
        </div>
      </section>

      {/* B. Our Story */}
      <section className="py-16 sm:py-20 bg-pure-white">
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <SectionHeading title="Cleaning should not require another project to manage." />
            <div className="mt-6 space-y-5 text-warm-text leading-relaxed">
              <p>
                Finding a residential cleaner often means exchanging messages, waiting for
                estimates, comparing unclear prices, and hoping the appointment goes as
                planned. BeLa Cleaning was built around a simpler idea: clear service
                options, transparent booking, dependable communication, and professional
                care for the home.
              </p>
              <p>
                We are locally owned and understand the pace of life in the New
                York–New Jersey metropolitan area. Our customers are professionals,
                couples, families, pet owners, and neighbors who want a clean home
                without sacrificing more of their limited time.
              </p>
              <p>
                BeLa Cleaning combines convenient online booking with the accountability
                and attention of a neighborhood business.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* C. Our Standard */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading title="What you should expect from BeLa." align="center" className="mx-auto" />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {standards.map((item) => (
              <Reveal key={item.title}>
                <div className="rounded-2xl border border-soft-gray bg-pure-white p-7 h-full">
                  <h3 className="font-heading text-xl text-charcoal">{item.title}</h3>
                  <p className="mt-2 text-warm-text leading-relaxed">{item.copy}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* D. Local Ownership */}
      <section className="py-16 sm:py-20 bg-pure-white">
        <div className="mx-auto max-w-7xl px-6 grid gap-12 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <SectionHeading title="We clean where we live." />
            <div className="mt-6 space-y-4 text-warm-text leading-relaxed">
              <p>
                BeLa Cleaning is not a national franchise or distant marketplace. We are
                building a local residential cleaning company around the needs of the
                communities we serve.
              </p>
              <p>
                That means understanding apartment access, busy work schedules, pets,
                building requirements, and the importance of dependable communication.
              </p>
            </div>
            <p className="mt-6 font-heading text-xl text-deep-green">
              Your neighborhood. Your cleaner. Your peace of mind.
            </p>
          </Reveal>
          <Reveal>
            <ResponsiveImageSection image={images.aboutLocal} aspectClassName="aspect-[5/4]" />
          </Reveal>
        </div>
      </section>

      {/* E. Contact Section */}
      <section id="contact" className="py-20 sm:py-28 scroll-mt-24">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading
            title="Questions before you book?"
            supporting="Most customers can select their service and schedule directly online. For a request that does not match the available booking options, contact BeLa Cleaning."
          />
          <div className="mt-12 grid gap-12 lg:grid-cols-2">
            <div>
              <ContactDetails />
              <p className="mt-6 text-sm text-warm-text">
                Website:{" "}
                <a
                  href={businessConfig.websiteUrl}
                  className="text-deep-green underline underline-offset-2 hover:text-charcoal"
                >
                  www.belacleaning.com
                </a>
              </p>
              <div className="mt-8">
                <PrimaryButton href={businessConfig.bookingUrl}>{CTA_LABEL}</PrimaryButton>
              </div>
            </div>
            <div className="rounded-2xl border border-soft-gray bg-pure-white p-6 sm:p-8">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>

      {/* F. About Final CTA */}
      <CTASection
        headline="Spend less time arranging cleaning."
        copy="Choose your service, review your total, and schedule your appointment online."
      />
    </>
  );
}

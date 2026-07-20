import PrimaryButton from "./PrimaryButton";
import { businessConfig, CTA_LABEL } from "@/lib/config";

type CTASectionProps = {
  headline: string;
  copy?: string;
};

export default function CTASection({ headline, copy }: CTASectionProps) {
  return (
    <section className="bg-deep-green">
      <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24 text-center">
        <h2 className="font-heading text-3xl sm:text-4xl text-pure-white text-balance">
          {headline}
        </h2>
        {copy && (
          <p className="mt-4 text-base sm:text-lg text-soft-gray max-w-xl mx-auto">
            {copy}
          </p>
        )}
        <div className="mt-8 flex justify-center">
          <PrimaryButton href={businessConfig.bookingUrl} variant="inverted">
            {CTA_LABEL}
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}

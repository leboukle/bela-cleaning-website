import type { Testimonial } from "@/lib/testimonials";
import { Quote } from "lucide-react";

type TestimonialCardProps = {
  testimonial: Testimonial;
};

export default function TestimonialCard({ testimonial }: TestimonialCardProps) {
  return (
    <figure className="flex h-full flex-col justify-between rounded-2xl bg-pure-white border border-soft-gray p-8">
      <Quote size={22} className="text-sage" aria-hidden="true" />
      <blockquote className="mt-4 flex-1 text-lg text-charcoal leading-relaxed">
        {testimonial.quote}
      </blockquote>
      <figcaption className="mt-6 text-sm font-medium text-warm-text">
        {testimonial.attribution}
      </figcaption>
    </figure>
  );
}

import type { Testimonial } from "@/lib/testimonials";
import { Quote } from "lucide-react";

type TestimonialCardProps = {
  testimonial: Testimonial;
};

export default function TestimonialCard({ testimonial }: TestimonialCardProps) {
  return (
    <figure className="flex h-full flex-col border-t border-soft-gray pt-8">
      <Quote size={20} className="text-sage" aria-hidden="true" />
      <blockquote className="mt-4 flex-1 text-lg text-charcoal leading-relaxed">
        {testimonial.quote}
      </blockquote>
      <figcaption className="mt-6 text-sm font-medium text-warm-text">
        {testimonial.attribution}
      </figcaption>
    </figure>
  );
}

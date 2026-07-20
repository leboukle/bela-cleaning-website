import type { LucideIcon } from "lucide-react";

type BenefitCardProps = {
  icon: LucideIcon;
  title: string;
  copy: string;
};

export default function BenefitCard({ icon: Icon, title, copy }: BenefitCardProps) {
  return (
    <div className="rounded-2xl border border-soft-gray bg-pure-white p-8 transition-transform duration-300 ease-out motion-safe:hover:-translate-y-1">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-soft-gray text-deep-green">
        <Icon size={20} aria-hidden="true" />
      </span>
      <h3 className="mt-5 font-heading text-xl text-charcoal">{title}</h3>
      <p className="mt-2 text-warm-text leading-relaxed">{copy}</p>
    </div>
  );
}

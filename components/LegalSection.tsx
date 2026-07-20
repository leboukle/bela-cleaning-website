import type { ReactNode } from "react";

type LegalSectionProps = {
  id: string;
  number: number;
  title: string;
  children: ReactNode;
};

export default function LegalSection({ id, number, title, children }: LegalSectionProps) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="font-heading text-2xl text-charcoal">
        {number}. {title}
      </h2>
      <div className="mt-4 space-y-4 text-warm-text leading-relaxed [&_a]:text-deep-green [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-charcoal [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

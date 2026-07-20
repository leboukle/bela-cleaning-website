import type { ReactNode } from "react";

export type LegalTOCItem = {
  id: string;
  title: string;
};

type LegalLayoutProps = {
  title: string;
  lastUpdatedDisplay: string;
  toc: LegalTOCItem[];
  children: ReactNode;
};

export default function LegalLayout({ title, lastUpdatedDisplay, toc, children }: LegalLayoutProps) {
  return (
    <>
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-deep-green">
            Legal
          </p>
          <h1 className="font-heading text-4xl sm:text-5xl text-charcoal">{title}</h1>
          <p className="mt-3 text-sm text-warm-text">Last updated: {lastUpdatedDisplay}</p>
          <p className="mt-6 border-l-2 border-soft-gray pl-4 text-warm-text leading-relaxed">
            These policies should be reviewed periodically as BeLa Cleaning&rsquo;s services,
            technologies, and operating practices evolve.
          </p>
        </div>
      </section>

      <section className="pb-20 sm:pb-28 border-t border-soft-gray">
        <div className="mx-auto max-w-6xl px-6 pt-12 grid gap-12 lg:grid-cols-[240px_1fr]">
          <nav aria-label="Sections on this page" className="lg:sticky lg:top-28 lg:self-start">
            <p className="mb-3 text-xs uppercase tracking-wide text-warm-text">On this page</p>
            <ol className="space-y-2 text-sm">
              {toc.map((item, index) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="text-charcoal hover:text-deep-green hover:underline underline-offset-2"
                  >
                    {index + 1}. {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="max-w-3xl space-y-12">{children}</div>
        </div>
      </section>
    </>
  );
}

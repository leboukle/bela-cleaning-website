type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  supporting?: string;
  align?: "left" | "center";
  as?: "h1" | "h2" | "h3";
  className?: string;
};

export default function SectionHeading({
  eyebrow,
  title,
  supporting,
  align = "left",
  as: Heading = "h2",
  className = "",
}: SectionHeadingProps) {
  const alignment = align === "center" ? "text-center mx-auto" : "text-left";

  return (
    <div className={`max-w-2xl ${alignment} ${className}`}>
      {eyebrow && (
        <p className="text-xs font-semibold tracking-[0.18em] text-deep-green uppercase mb-3">
          {eyebrow}
        </p>
      )}
      <Heading className="font-heading text-3xl sm:text-4xl md:text-[2.75rem] leading-tight text-charcoal text-balance">
        {title}
      </Heading>
      {supporting && (
        <p className="mt-4 text-base sm:text-lg text-warm-text leading-relaxed">
          {supporting}
        </p>
      )}
    </div>
  );
}

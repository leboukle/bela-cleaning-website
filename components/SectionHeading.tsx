type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  supporting?: string;
  align?: "left" | "center";
  as?: "h1" | "h2" | "h3";
  dark?: boolean;
  className?: string;
};

export default function SectionHeading({
  eyebrow,
  title,
  supporting,
  align = "left",
  as: Heading = "h2",
  dark = false,
  className = "",
}: SectionHeadingProps) {
  const alignment = align === "center" ? "text-center mx-auto" : "text-left";
  const eyebrowColor = dark ? "text-sage" : "text-deep-green";
  const titleColor = dark ? "text-pure-white" : "text-charcoal";
  const supportingColor = dark ? "text-soft-gray/80" : "text-warm-text";

  return (
    <div className={`max-w-2xl ${alignment} ${className}`}>
      {eyebrow && (
        <p className={`text-xs font-semibold tracking-[0.2em] uppercase mb-3 ${eyebrowColor}`}>
          {eyebrow}
        </p>
      )}
      <Heading
        className={`font-heading text-4xl sm:text-5xl md:text-6xl leading-[1.05] text-balance ${titleColor}`}
      >
        {title}
      </Heading>
      {supporting && (
        <p className={`mt-5 text-base sm:text-lg leading-relaxed ${supportingColor}`}>
          {supporting}
        </p>
      )}
    </div>
  );
}

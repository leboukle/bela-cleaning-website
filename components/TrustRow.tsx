import { Check } from "lucide-react";

const trustPoints = [
  "Transparent pricing",
  "No contracts",
  "No hidden fees",
  "Online booking available 24/7",
];

type TrustRowProps = {
  className?: string;
  light?: boolean;
};

export default function TrustRow({ className = "", light = false }: TrustRowProps) {
  const textColor = light ? "text-pure-white" : "text-charcoal";
  const iconColor = light ? "text-pure-white" : "text-deep-green";

  return (
    <ul
      className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${className}`}
      aria-label="Why book with BeLa Cleaning"
    >
      {trustPoints.map((point) => (
        <li key={point} className={`flex items-center gap-2 text-sm ${textColor}`}>
          <Check size={16} className={iconColor} aria-hidden="true" />
          <span>{point}</span>
        </li>
      ))}
    </ul>
  );
}

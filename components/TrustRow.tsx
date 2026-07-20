import { Check } from "lucide-react";

const trustPoints = [
  "Transparent pricing",
  "No contracts",
  "No hidden fees",
  "Online booking available 24/7",
];

type TrustRowProps = {
  className?: string;
};

export default function TrustRow({ className = "" }: TrustRowProps) {
  return (
    <ul
      className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${className}`}
      aria-label="Why book with BeLa Cleaning"
    >
      {trustPoints.map((point) => (
        <li key={point} className="flex items-center gap-2 text-sm text-charcoal">
          <Check size={16} className="text-deep-green" aria-hidden="true" />
          <span>{point}</span>
        </li>
      ))}
    </ul>
  );
}

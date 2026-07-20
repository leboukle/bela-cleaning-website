import { Mail, Phone, Clock, MapPin, CalendarClock } from "lucide-react";
import { businessConfig } from "@/lib/config";

type ContactDetailsProps = {
  variant?: "light" | "dark";
  className?: string;
};

export default function ContactDetails({
  variant = "light",
  className = "",
}: ContactDetailsProps) {
  const isDark = variant === "dark";
  const labelColor = isDark ? "text-soft-gray/70" : "text-warm-text";
  const valueColor = isDark ? "text-pure-white" : "text-charcoal";
  const iconColor = isDark ? "text-soft-gray" : "text-deep-green";

  const rows = [
    {
      icon: Mail,
      label: "Email",
      value: businessConfig.email,
      href: `mailto:${businessConfig.email}`,
    },
    {
      icon: Phone,
      label: "Phone",
      value: businessConfig.phoneDisplay,
      href: businessConfig.phoneHref,
    },
    {
      icon: Clock,
      label: "Customer service hours",
      value: businessConfig.customerServiceHours,
    },
    {
      icon: CalendarClock,
      label: "Online booking",
      value: businessConfig.onlineBookingHoursShort,
    },
    {
      icon: MapPin,
      label: "Service area",
      value: businessConfig.serviceAreaSentence,
    },
  ];

  return (
    <dl className={`space-y-5 ${className}`}>
      {rows.map((row) => (
        <div key={row.label} className="flex gap-3">
          <row.icon size={18} className={`mt-0.5 shrink-0 ${iconColor}`} aria-hidden="true" />
          <div>
            <dt className={`text-xs uppercase tracking-wide ${labelColor}`}>{row.label}</dt>
            {row.href ? (
              <dd>
                <a
                  href={row.href}
                  className={`font-medium ${valueColor} underline decoration-transparent hover:decoration-current transition-colors`}
                >
                  {row.value}
                </a>
              </dd>
            ) : (
              <dd className={`font-medium ${valueColor}`}>{row.value}</dd>
            )}
          </div>
        </div>
      ))}
    </dl>
  );
}

import { Mail, Phone, Clock, CalendarClock } from "lucide-react";
import { businessConfig } from "@/lib/config";

// Compact customer-service block used near the bottom of the Home and
// Services pages in place of a standalone Contact page.
export default function CustomerServiceBlock() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="font-heading text-2xl sm:text-3xl text-charcoal">
          Need help before booking?
        </h2>
        <p className="mt-3 text-warm-text leading-relaxed">
          For questions about an existing appointment, service availability, or booking
          access, contact BeLa Cleaning.
        </p>

        <dl className="mt-8 grid gap-6 sm:grid-cols-2 max-w-xl mx-auto text-left">
          <div className="flex items-start gap-3">
            <Mail size={18} className="mt-0.5 shrink-0 text-deep-green" aria-hidden="true" />
            <div>
              <dt className="text-xs uppercase tracking-wide text-warm-text">Email</dt>
              <dd>
                <a
                  href={`mailto:${businessConfig.email}`}
                  className="font-medium text-charcoal underline decoration-transparent hover:decoration-current transition-colors"
                >
                  {businessConfig.email}
                </a>
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Phone size={18} className="mt-0.5 shrink-0 text-deep-green" aria-hidden="true" />
            <div>
              <dt className="text-xs uppercase tracking-wide text-warm-text">Phone</dt>
              <dd>
                <a
                  href={businessConfig.phoneHref}
                  className="font-medium text-charcoal underline decoration-transparent hover:decoration-current transition-colors"
                >
                  {businessConfig.phoneDisplay}
                </a>
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock size={18} className="mt-0.5 shrink-0 text-deep-green" aria-hidden="true" />
            <div>
              <dt className="text-xs uppercase tracking-wide text-warm-text">
                Customer service
              </dt>
              <dd className="font-medium text-charcoal">{businessConfig.customerServiceHours}</dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <CalendarClock size={18} className="mt-0.5 shrink-0 text-deep-green" aria-hidden="true" />
            <div>
              <dt className="text-xs uppercase tracking-wide text-warm-text">
                Online booking
              </dt>
              <dd className="font-medium text-charcoal">{businessConfig.onlineBookingHoursShort}</dd>
            </div>
          </div>
        </dl>
      </div>
    </section>
  );
}

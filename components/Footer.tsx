import Link from "next/link";
import { primaryNav } from "@/lib/nav";
import { businessConfig, CTA_LABEL } from "@/lib/config";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-charcoal text-soft-gray">
      <div className="mx-auto max-w-7xl px-6 py-16 grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="font-heading text-2xl text-pure-white">BeLa Cleaning</span>
          <p className="mt-3 text-sm leading-relaxed text-soft-gray/80 max-w-xs">
            Residential cleaning for busy lives across Jersey City, Hoboken, Newark, and
            nearby communities.
          </p>
        </div>

        <nav aria-label="Footer navigation">
          <h2 className="text-xs uppercase tracking-wide text-soft-gray/60 mb-4">Navigate</h2>
          <ul className="space-y-2.5 text-sm">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-pure-white transition-colors">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={businessConfig.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-pure-white transition-colors"
              >
                {CTA_LABEL}
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="text-xs uppercase tracking-wide text-soft-gray/60 mb-4">Contact</h2>
          <ul className="space-y-2.5 text-sm">
            <li>
              <a
                href={`mailto:${businessConfig.email}`}
                className="hover:text-pure-white transition-colors"
              >
                {businessConfig.email}
              </a>
            </li>
            <li>
              <a
                href={businessConfig.phoneHref}
                className="hover:text-pure-white transition-colors"
              >
                {businessConfig.phoneDisplay}
              </a>
            </li>
            <li className="text-soft-gray/80">
              {businessConfig.customerServiceDays}
              <br />
              {businessConfig.customerServiceTime}
            </li>
            <li className="text-soft-gray/80">Online booking: {businessConfig.onlineBookingHoursShort}</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-wide text-soft-gray/60 mb-4">Service Area</h2>
          <p className="text-sm text-soft-gray/80">
            {businessConfig.serviceAreas.join(" · ")}
          </p>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-soft-gray/60">
          <p>
            &copy; {year} {businessConfig.businessName}. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-pure-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-pure-white transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

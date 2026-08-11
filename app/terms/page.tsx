import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import LegalLayout, { type LegalTOCItem } from "@/components/LegalLayout";
import LegalSection from "@/components/LegalSection";
import { businessConfig } from "@/lib/config";
import { legalConfig, termsLastUpdatedDisplay } from "@/lib/legal";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms of Service | BeLa Cleaning",
  description:
    "Review BeLa Cleaning's Terms of Service, covering online booking and payment, service policies, and website use in Jersey City and beyond.",
  path: "/terms",
});

const toc: LegalTOCItem[] = [
  { id: "agreement", title: "Agreement to Terms" },
  { id: "about", title: "About BeLa Cleaning" },
  { id: "online-booking", title: "Online Booking" },
  { id: "services-availability", title: "Services, Availability, and Pricing" },
  { id: "accurate-info", title: "Accurate Service Information" },
  { id: "home-access", title: "Home Access and Customer Responsibilities" },
  { id: "cancellations", title: "Cancellations and Rescheduling" },
  { id: "payment", title: "Payment" },
  { id: "satisfaction", title: "Satisfaction Concerns" },
  { id: "applications", title: "Join the BeLa Cleaning Team Applications" },
  { id: "permitted-use", title: "Permitted Website Use" },
  { id: "intellectual-property", title: "Intellectual Property" },
  { id: "third-party", title: "Third-Party Services and Links" },
  { id: "availability", title: "Website Availability and Accuracy" },
  { id: "disclaimers", title: "Disclaimers" },
  { id: "liability", title: "Limitation of Liability" },
  { id: "governing-law", title: "Governing Law" },
  { id: "severability", title: "Severability and No Waiver" },
  { id: "changes", title: "Changes to Terms" },
  { id: "contact", title: "Contact" },
];

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdatedDisplay={termsLastUpdatedDisplay} toc={toc}>
      <LegalSection id="agreement" number={1} title="Agreement to Terms">
        <p>
          These Terms of Service govern access to and use of belacleaning.com. By
          accessing or using the website, you agree to these Terms. If you do not
          agree, do not use the website.
        </p>
        <p>
          Cleaning appointments booked through BeLa Cleaning&rsquo;s online booking
          system are also subject to the service selections, scheduling, cancellation
          provisions, and payment terms displayed and confirmed during the booking
          process.
        </p>
      </LegalSection>

      <LegalSection id="about" number={2} title="About BeLa Cleaning">
        <p>
          BeLa Cleaning provides residential cleaning services in Jersey City, Hoboken,
          Newark, and selected nearby communities.
        </p>
        <p>
          The website provides business information, links to online booking,
          customer-service contact details, and a cleaner-interest application.
        </p>
      </LegalSection>

      <LegalSection id="online-booking" number={3} title="Online Booking">
        <p>
          Book Cleaning directs customers to BeLa Cleaning&rsquo;s own online booking
          experience.
        </p>
        <p>Customers are responsible for:</p>
        <ul>
          <li>Providing accurate booking information</li>
          <li>Selecting the appropriate home size and service</li>
          <li>Selecting applicable add-ons</li>
          <li>Providing accurate access instructions</li>
          <li>Reviewing the displayed price before confirming</li>
          <li>Reviewing the policies presented during booking, including the payment terms in Section 8</li>
        </ul>
      </LegalSection>

      <LegalSection
        id="services-availability"
        number={4}
        title="Services, Availability, and Pricing"
      >
        <ul>
          <li>
            Service availability varies by location, date, provider availability, home
            condition, and selected service
          </li>
          <li>Prices and available options are displayed through the booking platform</li>
          <li>
            Website descriptions provide general information and do not override the
            selections and details confirmed during booking
          </li>
          <li>BeLa Cleaning may decline or reschedule a service when reasonably necessary</li>
          <li>No appointment is confirmed solely by browsing the website or sending an email</li>
        </ul>
      </LegalSection>

      <LegalSection id="accurate-info" number={5} title="Accurate Service Information">
        <p>Customers must provide reasonably accurate information concerning:</p>
        <ul>
          <li>Home size</li>
          <li>Number of bedrooms and bathrooms</li>
          <li>Condition of the home</li>
          <li>Pets</li>
          <li>Access</li>
          <li>Parking or building restrictions</li>
          <li>Selected add-ons</li>
          <li>Material conditions that could affect the service</li>
        </ul>
        <p>
          A material difference between the booked scope and the actual condition of
          the home may require discussion, adjustment, rescheduling, or customer
          approval before additional work is performed.
        </p>
      </LegalSection>

      <LegalSection
        id="home-access"
        number={6}
        title="Home Access and Customer Responsibilities"
      >
        <p>Customers are responsible for:</p>
        <ul>
          <li>Providing safe and lawful access</li>
          <li>Supplying complete building and entry instructions</li>
          <li>Ensuring utilities needed for cleaning are available</li>
          <li>Securing pets where appropriate</li>
          <li>Identifying fragile or high-value items</li>
          <li>Removing unlawful, dangerous, or hazardous materials</li>
          <li>Providing a reasonably safe working environment</li>
        </ul>
        <p>
          BeLa Cleaning may decline or stop work when conditions present a reasonable
          safety, health, access, or legal concern.
        </p>
      </LegalSection>

      <LegalSection id="cancellations" number={7} title="Cancellations and Rescheduling">
        <p>
          Appointments may be rescheduled or cancelled free of charge up to 24 hours
          before the scheduled appointment. To reschedule or cancel, contact BeLa
          Cleaning at{" "}
          <a href={`mailto:${businessConfig.email}`}>{businessConfig.email}</a> or{" "}
          <a href={businessConfig.phoneHref}>{businessConfig.phoneDisplay}</a>.
        </p>
        <p>
          Cancellations made less than 24 hours before the scheduled appointment may be
          subject to a fee at BeLa Cleaning&rsquo;s discretion.
        </p>
      </LegalSection>

      <LegalSection id="payment" number={8} title="Payment">
        <p>
          When you complete a booking, BeLa Cleaning uses {legalConfig.paymentProcessorName},
          a third-party payment processor, to securely collect and save your payment
          method. Your payment method is not charged at the time of booking.
        </p>
        <p>
          The estimated total displayed during booking will be charged automatically to
          the saved payment method starting one hour after your cleaning&rsquo;s
          scheduled end time, without further action from you. BeLa Cleaning does not
          receive, process, or store your full card number, CVC, or other card details
          — {legalConfig.paymentProcessorName} handles this exclusively.
        </p>
        <p>
          By confirming a booking, you authorize this future charge in the amount
          displayed, subject to any adjustment BeLa Cleaning communicates to you before
          the charge occurs.
        </p>
      </LegalSection>

      <LegalSection id="satisfaction" number={9} title="Satisfaction Concerns">
        <p>
          Customers should report service concerns promptly to{" "}
          <a href={`mailto:${businessConfig.email}`}>{businessConfig.email}</a> or{" "}
          <a href={businessConfig.phoneHref}>{businessConfig.phoneDisplay}</a> and
          provide sufficient detail for the matter to be reviewed.
        </p>
        <p>
          Any response, re-service, credit, or other resolution is subject to the
          circumstances and BeLa Cleaning&rsquo;s then-current service policies.
        </p>
      </LegalSection>

      <LegalSection id="applications" number={10} title="Join the BeLa Cleaning Team Applications">
        <ul>
          <li>Submitting an application does not create an employment relationship</li>
          <li>It does not guarantee an interview, assignment, engagement, or position</li>
          <li>Applicants must provide accurate information</li>
          <li>BeLa Cleaning may contact applicants about possible opportunities</li>
          <li>
            BeLa Cleaning may stop considering an application at its discretion, subject
            to applicable law
          </li>
          <li>
            Worker status, onboarding requirements, payment procedures, and assignment
            expectations will be addressed separately if the applicant advances
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="permitted-use" number={11} title="Permitted Website Use">
        <p>Ordinary lawful use of the website is permitted. You agree not to engage in:</p>
        <ul>
          <li>Illegal activity</li>
          <li>Fraud</li>
          <li>Impersonation</li>
          <li>Interference with website security</li>
          <li>Automated scraping that burdens the service</li>
          <li>Introduction of malicious code</li>
          <li>Attempts to obtain unauthorized access</li>
          <li>Misuse of application or contact forms</li>
          <li>Submission of false or misleading information</li>
          <li>Infringement of intellectual-property or privacy rights</li>
        </ul>
      </LegalSection>

      <LegalSection id="intellectual-property" number={12} title="Intellectual Property">
        <p>
          Website text, design, branding, graphics, and original content are owned by
          or licensed to BeLa Cleaning and protected by applicable law. You may view the
          site for personal, noncommercial purposes.
        </p>
        <p>
          BeLa Cleaning does not claim ownership over third-party photography or
          software beyond its applicable licenses.
        </p>
      </LegalSection>

      <LegalSection id="third-party" number={13} title="Third-Party Services and Links">
        <p>
          The site uses {legalConfig.paymentProcessorName} to process payments, may link
          to {legalConfig.formProviderName}, and may link to other third-party
          providers. BeLa Cleaning does not control those third parties, and their
          separate terms and policies apply to your use of their services.
        </p>
      </LegalSection>

      <LegalSection id="availability" number={14} title="Website Availability and Accuracy">
        <p>
          BeLa Cleaning seeks to keep website information accurate and available but
          does not promise that the website will always be uninterrupted, error-free,
          or completely current.
        </p>
        <p>BeLa Cleaning may correct content or modify the website.</p>
      </LegalSection>

      <LegalSection id="disclaimers" number={15} title="Disclaimers">
        <p>
          General website content is informational. Actual service terms are
          established through confirmed booking details and applicable policies
          presented during booking.
        </p>
        <p>
          Nothing in this section disclaims liability for intentional misconduct, gross
          negligence, or any obligation that cannot legally be disclaimed.
        </p>
      </LegalSection>

      <LegalSection id="liability" number={16} title="Limitation of Liability">
        <p>
          To the fullest extent permitted by applicable law, BeLa Cleaning will not be
          liable for indirect, incidental, special, consequential, or punitive damages
          arising solely from use of, or inability to use, the website.
        </p>
        <p>Nothing in these Terms limits liability that cannot legally be limited.</p>
        {/*
          DEVELOPER NOTE: An "Indemnification" section is intentionally
          omitted from this initial version. Consider attorney review before
          adding any customer indemnification obligation.
        */}
      </LegalSection>

      <LegalSection id="governing-law" number={17} title="Governing Law">
        <p>
          These Terms are governed by the laws of the State of New Jersey, without
          regard to conflict-of-law principles, except where applicable law requires
          otherwise.
        </p>
      </LegalSection>

      <LegalSection id="severability" number={18} title="Severability and No Waiver">
        <p>
          If a provision is found unenforceable, the remaining provisions remain in
          effect to the extent permitted by law.
        </p>
        <p>
          Failure to enforce a provision does not automatically waive the right to
          enforce it later.
        </p>
      </LegalSection>

      <LegalSection id="changes" number={19} title="Changes to Terms">
        <p>
          These Terms may be revised periodically. The Last Updated date will change
          when revisions are published. Changes do not retroactively alter the terms
          that applied to an already confirmed booking.
        </p>
      </LegalSection>

      <LegalSection id="contact" number={20} title="Contact">
        <p className="font-medium text-charcoal">{businessConfig.businessName}</p>
        <p>
          Email: <a href={`mailto:${businessConfig.email}`}>{businessConfig.email}</a>
          <br />
          Phone: <a href={businessConfig.phoneHref}>{businessConfig.phoneDisplay}</a>
          <br />
          Website:{" "}
          <a href={businessConfig.websiteUrl} target="_blank" rel="noopener noreferrer">
            {businessConfig.websiteUrl}
          </a>
        </p>
      </LegalSection>
    </LegalLayout>
  );
}

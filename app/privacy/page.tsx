import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import LegalLayout, { type LegalTOCItem } from "@/components/LegalLayout";
import LegalSection from "@/components/LegalSection";
import { businessConfig } from "@/lib/config";
import { legalConfig, privacyLastUpdatedDisplay } from "@/lib/legal";

export const metadata: Metadata = buildPageMetadata({
  title: "Privacy Policy | BeLa Cleaning",
  description:
    "Read BeLa Cleaning's Privacy Policy to learn how we collect, use, and protect information from our website, online booking, and cleaner applications.",
  path: "/privacy",
});

const toc: LegalTOCItem[] = [
  { id: "introduction", title: "Introduction" },
  { id: "information-we-collect", title: "Information We Collect" },
  { id: "bookingkoala", title: legalConfig.bookingProviderName },
  { id: "formspree", title: legalConfig.formProviderName },
  { id: "how-we-use-information", title: "How We Use Information" },
  { id: "disclosure", title: "How Information May Be Disclosed" },
  { id: "retention", title: "Data Retention" },
  { id: "security", title: "Data Security" },
  { id: "privacy-choices", title: "Privacy Choices and Requests" },
  { id: "state-privacy-rights", title: "State Privacy Rights" },
  { id: "childrens-privacy", title: "Children's Privacy" },
  { id: "third-party-links", title: "Third-Party Links" },
  { id: "policy-changes", title: "Policy Changes" },
  { id: "contact", title: "Contact" },
];

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdatedDisplay={privacyLastUpdatedDisplay} toc={toc}>
      <LegalSection id="introduction" number={1} title="Introduction">
        <p>
          BeLa Cleaning respects your privacy. This Privacy Policy explains how we
          collect, use, disclose, and protect information when you visit
          belacleaning.com, contact us, use links to book cleaning services, or submit
          an application through the Join the BeLa Cleaning Team page.
        </p>
        <p>By using the website, you acknowledge the practices described in this policy.</p>
      </LegalSection>

      <LegalSection id="information-we-collect" number={2} title="Information We Collect">
        <p>BeLa Cleaning may collect information in the following categories.</p>
        <p className="font-medium text-charcoal">Information customers provide directly:</p>
        <ul>
          <li>Name</li>
          <li>Email address</li>
          <li>Telephone number</li>
          <li>Information submitted through email or telephone communications</li>
          <li>Appointment-related questions</li>
          <li>Service-area or neighborhood information</li>
          <li>Other information voluntarily provided</li>
        </ul>
        <p className="font-medium text-charcoal">Cleaner-applicant information:</p>
        <ul>
          <li>First and last name</li>
          <li>Email address</li>
          <li>Telephone number</li>
          <li>City or neighborhood</li>
          <li>Cleaning experience</li>
          <li>Transportation access</li>
          <li>Cleaning-supply and equipment information</li>
          <li>Work-area preferences</li>
          <li>Availability</li>
          <li>Application responses</li>
          <li>Additional information voluntarily submitted</li>
        </ul>
        <p className="font-medium text-charcoal">Automatically collected website information:</p>
        <p>
          Hosting providers and technical services may automatically process limited
          data such as:
        </p>
        <ul>
          <li>IP address</li>
          <li>Browser type</li>
          <li>Device type</li>
          <li>Operating system</li>
          <li>Referring page</li>
          <li>Pages requested</li>
          <li>Approximate date and time of access</li>
          <li>Technical logs used for security and operation</li>
        </ul>
        <p>
          BeLa Cleaning does not use advertising cookies, analytics pixels, or
          behavioral tracking technologies on this website as of the date above.
        </p>
        {/*
          DEVELOPER INSTRUCTION: Audit all installed analytics, tracking,
          advertising, and cookie technologies before launch. Update this
          policy and add cookie controls if any nonessential tracking is
          introduced.
        */}
      </LegalSection>

      <LegalSection id="bookingkoala" number={3} title={legalConfig.bookingProviderName}>
        <p>
          When customers select Book Cleaning, they are directed to{" "}
          {legalConfig.bookingProviderName}, a third-party booking platform.
        </p>
        <p>
          Information entered into {legalConfig.bookingProviderName} is collected and
          processed under {legalConfig.bookingProviderName}&rsquo;s own privacy policy and
          terms, in addition to any information made available to BeLa Cleaning for
          scheduling, customer service, payment administration, and delivery of the
          requested service.
        </p>
        <ul>
          <li>
            <a href={legalConfig.bookingPrivacyUrl} target="_blank" rel="noopener noreferrer">
              {legalConfig.bookingProviderName} Privacy Policy
            </a>
          </li>
          <li>
            <a href={legalConfig.bookingTermsUrl} target="_blank" rel="noopener noreferrer">
              {legalConfig.bookingProviderName} Terms of Use
            </a>
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="formspree" number={4} title={legalConfig.formProviderName}>
        <p>
          The Join the BeLa Cleaning Team application is transmitted through{" "}
          {legalConfig.formProviderName} or another form-processing provider configured
          by BeLa Cleaning.
        </p>
        <p>
          That provider may process and store submitted application data to deliver the
          form, provide spam protection, retain submissions, and send notifications.
        </p>
        <ul>
          <li>
            <a
              href={legalConfig.formProviderPrivacyUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {legalConfig.formProviderName} Privacy Policy
            </a>
          </li>
        </ul>
        <p>
          If BeLa Cleaning later replaces this form provider, this section will be
          updated to name the current provider.
        </p>
      </LegalSection>

      <LegalSection id="how-we-use-information" number={5} title="How We Use Information">
        <p>Information may be used to:</p>
        <ul>
          <li>Operate, maintain, and secure the website</li>
          <li>Respond to questions</li>
          <li>Assist with booking access or existing appointments</li>
          <li>Coordinate and provide cleaning services</li>
          <li>Communicate service-related information</li>
          <li>Review cleaner applications</li>
          <li>Communicate about possible cleaning opportunities</li>
          <li>Prevent misuse, fraud, or security incidents</li>
          <li>Maintain business records</li>
          <li>Comply with legal obligations</li>
          <li>Enforce applicable agreements</li>
          <li>Improve business operations and customer experience</li>
        </ul>
        <p>
          Providing a phone number does not authorize promotional or marketing text
          messages.
        </p>
      </LegalSection>

      <LegalSection id="disclosure" number={6} title="How Information May Be Disclosed">
        <p>BeLa Cleaning may disclose information:</p>
        <ul>
          <li>To vendors and service providers performing work on its behalf</li>
          <li>
            To {legalConfig.bookingProviderName} for booking and service administration
          </li>
          <li>
            To {legalConfig.formProviderName} or a replacement application-form
            processor
          </li>
          <li>
            To website hosting and technical providers such as{" "}
            {legalConfig.hostingProviderName}
          </li>
          <li>To professional advisers when reasonably necessary</li>
          <li>When required by law, legal process, or governmental request</li>
          <li>To protect rights, safety, security, and property</li>
          <li>
            In connection with a merger, sale, financing, reorganization, or transfer of
            business assets
          </li>
        </ul>
        <p className="font-medium text-charcoal">
          BeLa Cleaning does not sell personal information for money.
        </p>
        <p>
          Information is shared only with the categories of recipients described above,
          as reasonably necessary to operate the website, provide services, and meet
          the purposes described in this policy.
        </p>
      </LegalSection>

      <LegalSection id="retention" number={7} title="Data Retention">
        <p>
          BeLa Cleaning retains personal information only for as long as reasonably
          necessary for the purposes described in this policy, including providing
          services, reviewing applications, maintaining appropriate records, resolving
          disputes, enforcing agreements, and meeting legal obligations.
        </p>
        <p>
          Retention periods may vary depending on the nature of the information and the
          reason it was collected.
        </p>
      </LegalSection>

      <LegalSection id="security" number={8} title="Data Security">
        <p>
          BeLa Cleaning uses reasonable administrative, technical, and organizational
          measures intended to protect personal information. However, no internet
          transmission or storage system can be guaranteed to be completely secure.
        </p>
      </LegalSection>

      <LegalSection id="privacy-choices" number={9} title="Privacy Choices and Requests">
        <p>
          Individuals may contact{" "}
          <a href={`mailto:${businessConfig.email}`}>{businessConfig.email}</a> to
          request, as applicable:
        </p>
        <ul>
          <li>Access to information they provided</li>
          <li>Correction of inaccurate information</li>
          <li>Deletion of information</li>
          <li>Withdrawal of a cleaner application</li>
          <li>Answers about privacy practices</li>
        </ul>
        <p>
          BeLa Cleaning may need to verify the requester&rsquo;s identity and may retain
          information when required or permitted by law. Not every request can be
          granted in every circumstance.
        </p>
      </LegalSection>

      <LegalSection id="state-privacy-rights" number={10} title="State Privacy Rights">
        <p>
          Depending on where an individual lives and whether an applicable privacy law
          covers BeLa Cleaning&rsquo;s activities, the individual may have additional
          rights concerning personal information.
        </p>
        <p>
          Requests may be submitted to{" "}
          <a href={`mailto:${businessConfig.email}`}>{businessConfig.email}</a>. BeLa
          Cleaning will evaluate requests under applicable law.
        </p>
      </LegalSection>

      <LegalSection id="childrens-privacy" number={11} title="Children's Privacy">
        <p>
          The website is intended for adults seeking residential cleaning services or
          possible cleaning opportunities. It is not directed to children under 13, and
          BeLa Cleaning does not knowingly collect personal information from children
          under 13 through this website.
        </p>
        <p>
          If BeLa Cleaning learns that such information was submitted, it may take
          reasonable steps to delete it.
        </p>
      </LegalSection>

      <LegalSection id="third-party-links" number={12} title="Third-Party Links">
        <p>
          The site contains links to third-party services. BeLa Cleaning is not
          responsible for the separate privacy practices of those third parties. We
          encourage you to review their policies before providing information to them.
        </p>
      </LegalSection>

      <LegalSection id="policy-changes" number={13} title="Policy Changes">
        <p>
          This policy may be updated periodically. The revised version will display a
          new Last Updated date. Material changes may be communicated through the
          website when appropriate.
        </p>
      </LegalSection>

      <LegalSection id="contact" number={14} title="Contact">
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

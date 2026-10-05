// Centralized SEO metadata builder. Every page calls buildPageMetadata()
// with its own title/description/path so canonical URLs, Open Graph, and
// Twitter Card metadata stay complete and unique per page without each
// page file repeating the same boilerplate (title/description are the only
// thing that changes; url, siteName, type, card shape, etc. live here once).
import type { Metadata } from "next";
import { businessConfig } from "./config";
import { images, type SiteImage } from "./images";

// Homepage / sitewide-default SEO copy, defined once so app/layout.tsx's
// fallback metadata and app/page.tsx can never drift apart.
export const HOME_SEO_TITLE = "BeLa Cleaning | Residential Cleaning in Northern New Jersey";
export const HOME_SEO_DESCRIPTION =
  "Professional residential cleaning across Northern New Jersey, including communities along the PATH and Hudson-Bergen Light Rail. Easy online booking.";

// Service-area structured data (schema.org `areaServed`), shared by the
// sitewide LocalBusiness entry and the /services Service entry. This is
// MARKETING positioning only — which addresses can actually book online is
// decided solely by lib/booking/serviceArea.ts (ZIP eligibility), which this
// file never reads or affects.
export const areaServedStructuredData = [
  { "@type": "Place", name: "Northern New Jersey" },
  { "@type": "City", name: "Jersey City" },
  { "@type": "City", name: "Hoboken" },
  { "@type": "City", name: "Bayonne" },
  { "@type": "City", name: "Weehawken" },
  { "@type": "City", name: "Newark" },
];

type PageSeoInput = {
  /** Full <title> text, already including the " | BeLa Cleaning" suffix if desired. */
  title: string;
  /** ~150-160 character meta description. */
  description: string;
  /** Site-relative path, e.g. "/services". Use "/" for the homepage. */
  path: string;
  /** Image used for Open Graph / Twitter previews. Defaults to the branded OG card. */
  image?: SiteImage;
};

export function buildPageMetadata({
  title,
  description,
  path,
  image = images.ogImage,
}: PageSeoInput): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: businessConfig.businessName,
      title,
      description,
      images: [{ url: image.src, alt: image.alt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.src],
    },
  };
}

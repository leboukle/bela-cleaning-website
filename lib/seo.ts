// Centralized SEO metadata builder. Every page calls buildPageMetadata()
// with its own title/description/path so canonical URLs, Open Graph, and
// Twitter Card metadata stay complete and unique per page without each
// page file repeating the same boilerplate (title/description are the only
// thing that changes; url, siteName, type, card shape, etc. live here once).
import type { Metadata } from "next";
import { businessConfig } from "./config";
import { images, type SiteImage } from "./images";

type PageSeoInput = {
  /** Full <title> text, already including the " | BeLa Cleaning" suffix if desired. */
  title: string;
  /** ~150-160 character meta description. */
  description: string;
  /** Site-relative path, e.g. "/services". Use "/" for the homepage. */
  path: string;
  /** Image used for Open Graph / Twitter previews. Defaults to the homepage hero. */
  image?: SiteImage;
};

export function buildPageMetadata({
  title,
  description,
  path,
  image = images.homeHero,
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

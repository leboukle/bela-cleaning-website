import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { businessConfig } from "@/lib/config";
import { images } from "@/lib/images";

const dmSerifDisplay = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dm-serif-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const defaultTitle = "BeLa Cleaning | Residential House Cleaning in Jersey City";
const defaultDescription =
  "Book residential house cleaning online in Jersey City, Hoboken, and Newark. Transparent pricing, no contracts, and easy online booking with BeLa Cleaning.";

// DEVELOPER NOTE: This root layout provides sitewide metadata defaults
// (used only as a fallback if a page doesn't set its own) plus the
// sitewide LocalBusiness/Organization/WebSite structured data. Individual
// pages set their own unique title, description, canonical URL, Open
// Graph, and Twitter Card metadata via lib/seo.ts's buildPageMetadata() —
// see app/page.tsx, app/services/page.tsx, etc.
export const metadata: Metadata = {
  metadataBase: new URL(businessConfig.websiteUrl),
  title: {
    default: defaultTitle,
    template: `%s | ${businessConfig.businessName}`,
  },
  description: defaultDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: businessConfig.businessName,
    title: defaultTitle,
    description: defaultDescription,
    images: [
      {
        url: images.ogImage.src,
        alt: images.ogImage.alt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: [images.ogImage.src],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#263C32",
};

// Sitewide JSON-LD structured data as a single @graph: the Organization
// behind the site, the WebSite itself, and the LocalBusiness (also labeled
// CleaningService) that customers and search engines care about most.
// Page-specific structured data (e.g. the Service catalog on /services)
// lives in that page's own file and is additive, not duplicative.
const organizationId = `${businessConfig.websiteUrl}/#organization`;
const websiteId = `${businessConfig.websiteUrl}/#website`;
const localBusinessId = `${businessConfig.websiteUrl}/#localbusiness`;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: businessConfig.businessName,
      url: businessConfig.websiteUrl,
      email: businessConfig.email,
      telephone: "+1-551-225-0276",
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      url: businessConfig.websiteUrl,
      name: businessConfig.businessName,
      publisher: { "@id": organizationId },
    },
    {
      "@type": ["LocalBusiness", "CleaningService"],
      "@id": localBusinessId,
      name: businessConfig.businessName,
      url: businessConfig.websiteUrl,
      email: businessConfig.email,
      telephone: "+1-551-225-0276",
      image: images.homeHero.src,
      areaServed: [
        { "@type": "City", name: "Jersey City" },
        { "@type": "City", name: "Hoboken" },
        { "@type": "City", name: "Newark" },
        "Nearby communities",
      ],
      openingHoursSpecification: {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "08:00",
        closes: "17:00",
      },
      makesOffer: {
        "@type": "Offer",
        url: businessConfig.bookingUrl,
        name: "Residential Cleaning Booking",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSerifDisplay.variable} ${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <noscript>
          <style>{`.reveal { opacity: 1 !important; }`}</style>
        </noscript>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-full focus:bg-deep-green focus:px-5 focus:py-3 focus:text-sm focus:font-medium focus:text-pure-white"
        >
          Skip to main content
        </a>
        <Header />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
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

export const metadata: Metadata = {
  metadataBase: new URL(businessConfig.websiteUrl),
  title: {
    default: "BeLa Cleaning | Residential Cleaning in Jersey City, Hoboken & Newark",
    template: `%s | ${businessConfig.businessName}`,
  },
  description:
    "Book dependable residential cleaning online with transparent pricing and no contracts. BeLa Cleaning serves Jersey City, Hoboken, Newark, and nearby communities.",
  openGraph: {
    type: "website",
    url: businessConfig.websiteUrl,
    siteName: businessConfig.businessName,
    title: "BeLa Cleaning | Residential Cleaning in Jersey City, Hoboken & Newark",
    description:
      "Book dependable residential cleaning online with transparent pricing and no contracts. Serving Jersey City, Hoboken, Newark, and nearby communities.",
    images: [
      {
        url: images.homeHero.src,
        alt: images.homeHero.alt,
      },
    ],
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: businessConfig.businessName,
  url: businessConfig.websiteUrl,
  email: businessConfig.email,
  telephone: "+1-551-225-0276",
  areaServed: ["Jersey City", "Hoboken", "Newark"],
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    opens: "08:00",
    closes: "17:00",
  },
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
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

import type { MetadataRoute } from "next";
import { businessConfig } from "@/lib/config";
import { legalConfig } from "@/lib/legal";

// A fixed date (rather than `new Date()` at request time) so lastModified
// reflects actual content changes instead of the moment the sitemap was
// last generated/crawled — search engines treat a constantly-"now" date as
// a signal to ignore. Update SITE_CONTENT_UPDATED when marketing page copy
// changes; legal pages use their own lastUpdated values from lib/legal.ts.
const SITE_CONTENT_UPDATED = "2026-07-20";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: Array<{ path: string; priority: number; lastModified: string }> = [
    { path: "", priority: 1, lastModified: SITE_CONTENT_UPDATED },
    { path: "/services", priority: 0.8, lastModified: SITE_CONTENT_UPDATED },
    { path: "/join-our-team", priority: 0.6, lastModified: SITE_CONTENT_UPDATED },
    { path: "/privacy", priority: 0.3, lastModified: legalConfig.privacyLastUpdated },
    { path: "/terms", priority: 0.3, lastModified: legalConfig.termsLastUpdated },
  ];

  return routes.map((route) => ({
    url: `${businessConfig.websiteUrl}${route.path}`,
    lastModified: route.lastModified,
    changeFrequency: "monthly",
    priority: route.priority,
  }));
}

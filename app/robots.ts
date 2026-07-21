import type { MetadataRoute } from "next";
import { businessConfig } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${businessConfig.websiteUrl}/sitemap.xml`,
    host: businessConfig.websiteUrl,
  };
}

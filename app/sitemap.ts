import type { MetadataRoute } from "next";
import { businessConfig } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/services", "/work-with-us", "/privacy", "/terms"];

  return routes.map((route) => ({
    url: `${businessConfig.websiteUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}

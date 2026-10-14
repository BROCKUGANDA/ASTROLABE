import type { MetadataRoute } from "next";

/**
 * ASTROLABE — sitemap.xml (PRD §17)
 * Served at `/sitemap.xml` (Next.js metadata route).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://astrolabe.internal",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}

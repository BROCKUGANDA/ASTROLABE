import type { MetadataRoute } from "next";

/**
 * ASTROLABE — robots.txt (PRD §17)
 * Served at `/robots.txt` (Next.js metadata route).
 *
 * Prototype is indexable. A real production deployment would set
 * `disallow: "/"` until the app is GA.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: "https://astrolabe.internal/sitemap.xml",
  };
}

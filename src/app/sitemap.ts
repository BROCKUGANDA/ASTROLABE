import type { MetadataRoute } from "next";
import { NOW } from "@/lib/data/pack";
import { SITE_FAQ, absolute } from "@/lib/site";

/**
 * ASTROLABE — sitemap.xml (PRD §17), served at `/sitemap.xml`.
 *
 * One indexable page, honestly: this is a console whose content arrives after a
 * session is established, so there is no crawlable archive to enumerate. The
 * `lastmod` is the data pack's reference time rather than `new Date()` — a
 * timestamp that moved on every request told crawlers the page changed
 * constantly, which is the fastest way to be crawled less.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = NOW;
  const entries: MetadataRoute.Sitemap = [
    {
      url: absolute("/"),
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          "en-AE": absolute("/"),
          "ar-AE": absolute("/?locale=ar"),
        },
      },
    },
    // The answer set, published as a document answer engines can cite.
    {
      url: absolute("/llms.txt"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
  return entries.concat(
    SITE_FAQ.map((f, i) => ({
      url: absolute(`/#faq-${i + 1}`),
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  );
}

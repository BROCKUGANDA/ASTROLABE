import type { MetadataRoute } from "next";
import { absolute } from "@/lib/site";

/**
 * ASTROLABE — robots.txt (PRD §17), served at `/robots.txt`.
 *
 * The shell is crawlable on purpose: it is the only page that explains what the
 * product is, and an answer engine asked about it should find a document rather
 * than a 404. Everything that carries a person's data is not: the whole API is
 * disallowed here, and each `/api/*` response also says `noindex` in an
 * `X-Robots-Tag` header, because a `robots.txt` line is a request, not a
 * control, and the header still applies if someone links to a response anyway.
 *
 * The origin comes from SITE_URL. It used to be the literal
 * `https://astrolabe.internal` — a host that does not exist — which made the
 * `Sitemap:` line point at nothing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/manifest.webmanifest"],
      },
      // Crawlers that answer questions directly get the same boundary, named.
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: ["/api/"],
      },
      {
        userAgent: "ClaudeBot",
        allow: "/",
        disallow: ["/api/"],
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: ["/api/"],
      },
      {
        // Archive crawlers snapshot responses that contain employee records;
        // a snapshot of a synthetic record is still a snapshot of a record shape.
        userAgent: "*archive*",
        disallow: "/api/",
        allow: "/",
      },
    ],
    sitemap: absolute("/sitemap.xml"),
    host: absolute("/"),
  };
}

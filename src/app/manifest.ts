import type { MetadataRoute } from "next";

/**
 * ASTROLABE — PWA manifest (PRD §17)
 * Served at `/manifest.webmanifest` (Next.js metadata route).
 */
import { SITE_DESCRIPTION, SITE_NAME, absolute } from "@/lib/site";

/**
 * ASTROLABE — PWA manifest (PRD §17), served at `/manifest.webmanifest`.
 *
 * Icons are generated from the brand mark by `bun run scripts/make-icons.ts`.
 * `maskable` exists because an Android launcher crops an icon to a circle: the
 * 512 maskable copy keeps the mark inside the 80% safe zone so the compass is
 * not the thing that gets cut off.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: absolute("/"),
    name: `${SITE_NAME} — Employee Journey Companion`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0B111C",
    theme_color: "#169AA5",
    lang: "en-AE",
    dir: "ltr",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Today", url: "/?view=today", description: "What now, and whose turn is it" },
      { name: "Ask a policy question", url: "/?view=ask", description: "Cited answers, or none" },
    ],
  };
}

import type { MetadataRoute } from "next";

/**
 * ASTROLABE — PWA manifest (PRD §17)
 * Served at `/manifest.webmanifest` (Next.js metadata route).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ASTROLABE — Employee Journey Companion",
    short_name: "ASTROLABE",
    description: "A navigation instrument for onboarding and internal mobility.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B111C",
    theme_color: "#169AA5",
    icons: [{ src: "/logo.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

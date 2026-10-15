import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SITE_FAQ, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL, absolute } from "@/lib/site";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "employee journey",
    "onboarding companion",
    "internal mobility",
    "responsible AI",
    "deterministic engine",
    "consent-gated analytics",
    "human oversight",
    "Emirates cabin crew",
    "policy citation",
    "ASTROLABE",
  ],
  authors: [{ name: `${SITE_NAME} — Emirates challenge submission`, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/favicon-64.png", type: "image/png", sizes: "64x64" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  // The shell is public; everything behind a session is not, and the API says
  // so itself with X-Robots-Tag (see src/middleware.ts).
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: absolute("/"),
    languages: {
      "en-AE": absolute("/"),
      "ar-AE": absolute("/?locale=ar"),
    },
  },
  openGraph: {
    type: "website",
    url: absolute("/"),
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_AE",
    alternateLocale: ["ar_AE"],
    images: [
      {
        url: absolute("/og.png"),
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — the employee journey console showing a named next step, its owner and its due date`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [absolute("/og.png")],
  },
  appLinks: { web: { url: absolute("/"), should_fallback: true } },
  category: "technology",
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#169AA5",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

/**
 * Structured data for search and answer engines. A graph rather than one blob
 * because the three nodes answer different questions: what the application is,
 * who publishes it, and the specific claims a model is asked to repeat.
 *
 * Every answer in the FAQ node is a behaviour the repository enforces, not
 * marketing copy — an answer engine quoting a claim the product does not keep is
 * the worst possible outcome of publishing structured data.
 */
function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": absolute("/#app"),
        name: `${SITE_NAME} — Employee Journey Companion`,
        url: absolute("/"),
        description: SITE_DESCRIPTION,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Employee journey navigation",
        operatingSystem: "Web",
        browserRequirements: "Requires JavaScript",
        inLanguage: ["en-AE", "ar-AE"],
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "AED" },
        featureList: [
          "deterministic journey engine over an append-only event log",
          "42 versioned friction signals in seven families",
          "as-of replay with no future-data leakage",
          "cited bilingual policy answers with abstain-and-handoff",
          "consent-gated pulse analytics",
          "hash-chained audit log exposed to the employee",
          "named-human escalation packets",
        ],
      },
      {
        "@type": "Organization",
        "@id": absolute("/#org"),
        name: SITE_NAME,
        url: SITE_URL,
        logo: absolute("/icon.svg"),
        sameAs: ["https://github.com/BROCKUGANDA/ASTROLABE"],
      },
      {
        "@type": "FAQPage",
        "@id": absolute("/#faq"),
        mainEntity: SITE_FAQ.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
    ],
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${inter.variable} ${jetbrains.variable} ${plexArabic.variable} antialiased`}
      >
        {children}
        <Toaster />
        <SonnerToaster />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
        />
      </body>
    </html>
  );
}

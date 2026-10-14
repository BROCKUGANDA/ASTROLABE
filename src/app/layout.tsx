import type { Metadata } from "next";
import { Inter, JetBrains_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
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

const SITE_URL = "https://astrolabe.internal";
const SITE_TITLE = "ASTROLABE · Employee Journey Companion";
const SITE_DESCRIPTION =
  "A navigation instrument for onboarding and internal mobility. The deterministic engine decides — the model explains. Every answer cites its source. Unsure is a first-class answer.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "ASTROLABE",
  keywords: [
    "ASTROLABE",
    "employee journey",
    "onboarding",
    "internal mobility",
    "responsible AI",
    "Emirates",
  ],
  authors: [{ name: "ASTROLABE" }],
  creator: "ASTROLABE",
  publisher: "ASTROLABE",
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
  manifest: "/manifest.webmanifest",
  // Prototype is indexable; a real prod deployment would flip to noindex
  // until the app is GA.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  alternates: {
    canonical: "/",
    languages: {
      en: "/",
      ar: "/?locale=ar",
    },
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: "website",
    locale: "en_US",
    alternateLocale: ["ar_AE"],
    siteName: "ASTROLABE",
    url: SITE_URL,
    images: [
      {
        url: "/logo.svg",
        width: 512,
        height: 512,
        alt: "ASTROLABE — Employee Journey Companion",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/logo.svg"],
  },
  verification: {
    google: "astrolabe-verification",
  },
  category: "technology",
  formatDetection: { telephone: false, address: false, email: false },
};

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
      </body>
    </html>
  );
}

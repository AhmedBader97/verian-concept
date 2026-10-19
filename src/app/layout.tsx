import "@fontsource-variable/schibsted-grotesk/wght.css";
import "@fontsource/spectral/latin-300.css";
import "@fontsource/spectral/latin-400.css";
import "@fontsource/spectral/latin-400-italic.css";
import "@fontsource/spectral/latin-500.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "@/styles/globals.css";

import type { Metadata, Viewport } from "next";
import { AnalyticsGate } from "@/components/site/AnalyticsGate";
import { AskDialog } from "@/components/site/AskDialog";
import { ConceptPill } from "@/components/site/ConceptPill";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { SmoothScroll } from "@/components/site/SmoothScroll";

export const metadata: Metadata = {
  metadataBase: new URL("https://verian-concept.vercel.app"),
  title: {
    default: "Verian — a redesign concept by Ahmed Bader",
    template: "%s — Verian concept",
  },
  description:
    "An unofficial redesign of veriangroup.com with a live, auditable research assistant. Built by Ahmed Bader for the Junior AI Engineer / Forward Deployed Engineer role.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Verian — a redesign concept",
    description: "An unofficial redesign of veriangroup.com with a live, auditable research assistant, by Ahmed Bader.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Verian redesign concept: a ternary field of points beside the headline" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Verian — a redesign concept",
    description: "An unofficial redesign of veriangroup.com with a live, auditable research assistant, by Ahmed Bader.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#f1f3f2",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script
          // Marks JS as available before first paint, so the opening animation never flashes.
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SmoothScroll />
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <ConceptPill />
        <AskDialog />
        <AnalyticsGate />
      </body>
    </html>
  );
}

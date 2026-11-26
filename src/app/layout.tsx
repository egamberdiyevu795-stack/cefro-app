import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";

/*
 * Fonts are served from this app, never fetched at build time: Inter from public/fonts (@font-face in globals.css,
 * see docs/design-system.md), monospace from the platform. A blip in Google's font fetch failed the production build
 * twice, and a build must not depend on a third party being up.
 */

export const metadata: Metadata = {
  title: { default: "CEFRO — CEFR speaking practice", template: "%s · CEFRO" },
  description: "Practise CEFR speaking tasks and get specific, actionable feedback on every attempt.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* The weight the first screen is mostly set in: fetched with the page, not after the stylesheet parses. */}
        <link rel="preload" href="/fonts/inter-latin-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// The design-system font (see docs/design-system.md). Pages built on the design system use `font-ui`.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["300", "400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "CEFRO — CEFR speaking practice", template: "%s · CEFRO" },
  description: "Practise CEFR speaking tasks and get specific, actionable feedback on every attempt.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}

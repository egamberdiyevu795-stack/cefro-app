"use client";

import { Inter } from "next/font/google";
import { useEffect } from "react";
import { ErrorScreen } from "@/features/shell/ErrorScreen";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["300", "400", "500", "600"] });

/**
 * A failure in the root layout itself, which app/error.tsx cannot catch: the same design-system screen. It replaces
 * the root layout, so it brings its own <html>, <body>, styles and font.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[cefro] root error", error.digest ?? error.message);
  }, [error]);
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <title>CEFRO isn’t available right now</title>
        <ErrorScreen digest={error.digest} onRetry={retry} />
      </body>
    </html>
  );
}

"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/features/shell/ErrorScreen";
import "./globals.css";

/**
 * A failure in the root layout itself, which app/error.tsx cannot catch: the same design-system screen. It replaces
 * the root layout, so it brings its own <html>, <body> and styles; the font comes with globals.css, from this app.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[cefro] root error", error.digest ?? error.message);
  }, [error]);
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <title>CEFRO isn’t available right now</title>
        <ErrorScreen digest={error.digest} onRetry={retry} />
      </body>
    </html>
  );
}

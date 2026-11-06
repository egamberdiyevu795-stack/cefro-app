"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/features/shell/ErrorScreen";

/**
 * Any page that fails on the server (inside the root layout), on the design system. The status code stays what the
 * server set (500 for "server not configured"); only the page the student sees changes.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[cefro] page error", error.digest ?? error.message);
  }, [error]);
  return <ErrorScreen digest={error.digest} onRetry={retry} />;
}

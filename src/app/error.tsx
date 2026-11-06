"use client";

import { useEffect } from "react";
import { Card, PillAction, PillButton } from "@/components/ds";

/**
 * Any page that fails on the server, on the design system. Most often in production this is "server not configured"
 * (the practice page and the `(site)` pages refuse when a provider or sign-in setting is missing, see
 * server/config/boot-check.ts), so the copy says the service is unavailable, never why: production hides the error
 * message, and details stay in the server log. One black button: "Try again" (re-fetches the page).
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[cefro] page error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-start justify-center bg-page px-4 pt-16 font-ui text-fg sm:items-center sm:pt-0">
      <main id="main" className="w-full max-w-lg">
        <p className="mb-4 text-body font-semibold tracking-[0.08em] text-fg">CEFRO</p>
        <Card aria-labelledby="error-title">
          <h1 id="error-title" className="text-title font-medium tracking-[-0.01em] text-fg">
            CEFRO isn&rsquo;t available right now
          </h1>
          <p className="mt-2 text-body text-fg">
            Something on our side isn&rsquo;t working, so this page can&rsquo;t open. Your earlier answers are safe. Please try again in a
            few minutes.
          </p>
          {error.digest && <p className="mt-3 text-caption text-fg-muted">Reference: {error.digest}</p>}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <PillAction size="lg" icon="retry" onClick={retry} className="w-full sm:w-auto">
              Try again
            </PillAction>
            <PillButton href="/dashboard" variant="quiet" size="lg" className="w-full sm:w-auto">
              Go to the dashboard
            </PillButton>
          </div>
        </Card>
      </main>
    </div>
  );
}

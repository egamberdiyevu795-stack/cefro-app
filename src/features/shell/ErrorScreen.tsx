import { Card, PillAction, PillButton } from "@/components/ds";

/**
 * The page-failure screen, on the design system (app/error.tsx and app/global-error.tsx). Most often in production
 * this is "server not configured", so it says the service is unavailable, never why: production hides error details,
 * which stay in the server log. One black button: "Try again".
 */
export function ErrorScreen({ digest, onRetry }: { digest?: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-page px-4 pt-16 font-ui text-fg sm:items-center sm:pt-0">
      <main id="main" className="w-full max-w-lg">
        <p className="mb-4 text-body font-semibold tracking-[0.08em] text-fg">CEFRO</p>
        <Card aria-labelledby="error-title">
          <h1 id="error-title" className="text-title font-medium tracking-[-0.01em] text-fg">
            CEFRO isn&rsquo;t available right now
          </h1>
          <p className="mt-2 text-body text-fg">
            Something on our side isn&rsquo;t working, so this page can&rsquo;t open. Your earlier answers are safe. Please try again in a few
            minutes.
          </p>
          {digest && <p className="mt-3 text-caption text-fg-muted">Reference: {digest}</p>}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <PillAction size="lg" icon="retry" onClick={onRetry} className="w-full sm:w-auto">
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

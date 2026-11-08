import { Card, PillButton } from "@/components/ds";

/**
 * Not found, on the design system: unknown pages, unknown tasks, and results the caller does not own (which are
 * answered exactly like missing ones, so an attempt id reveals nothing). Status 404.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-page px-4 pt-16 font-ui text-fg sm:items-center sm:pt-0">
      <main id="main" className="w-full max-w-lg">
        <p className="mb-4 text-body font-semibold tracking-[0.08em] text-fg">CEFRO</p>
        <Card aria-labelledby="not-found-title">
          <h1 id="not-found-title" className="text-title font-medium tracking-[-0.01em] text-fg">
            We can&rsquo;t find this page
          </h1>
          <p className="mt-2 text-body text-fg">
            The link may be wrong, or this result belongs to another account or browser. Results can only be opened by the person who
            recorded them.
          </p>
          <div className="mt-6">
            <PillButton href="/dashboard" size="lg" className="w-full sm:w-auto">
              Go to the dashboard
            </PillButton>
          </div>
        </Card>
      </main>
    </div>
  );
}

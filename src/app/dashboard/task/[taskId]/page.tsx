import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Icon, PillButton } from "@/components/ds";
import { PRACTISE_NEXT } from "@/features/dashboard/mock-data";

export const metadata: Metadata = { title: "Practise next" };

/**
 * Mock route for the dashboard's "Practise next" task (design prototype). The task is mocked, so this page stands in
 * for the real task screen: it shows what would start, and goes back. No recording, no scoring.
 */
export default async function MockTaskPage(props: PageProps<"/dashboard/task/[taskId]">) {
  const { taskId } = await props.params;
  if (taskId !== PRACTISE_NEXT.id) notFound();

  return (
    <div className="min-h-dvh bg-page px-4 py-6 font-ui text-fg lg:p-6">
      <main id="main" className="mx-auto max-w-xl">
        <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1 text-label text-fg-muted hover:text-fg">
          <Icon name="chevronDown" size={14} className="rotate-90" />
          Dashboard
        </Link>
        <Card aria-labelledby="task-title">
          <p className="text-caption text-fg-muted">
            {PRACTISE_NEXT.part} · {PRACTISE_NEXT.reason}
          </p>
          <h1 id="task-title" className="mt-2 text-stat font-light tracking-[-0.03em]">
            {PRACTISE_NEXT.task}
          </h1>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4">
            <div>
              <dt className="text-caption text-fg-muted">Prepare</dt>
              <dd className="text-body font-semibold">{PRACTISE_NEXT.preparationMinutes} min</dd>
            </div>
            <div>
              <dt className="text-caption text-fg-muted">Speak</dt>
              <dd className="text-body font-semibold">up to {PRACTISE_NEXT.speakingMinutes} min</dd>
            </div>
          </dl>
          <p className="mt-6 rounded-tile bg-well p-3 text-label text-fg-muted">
            Mock task for the design prototype. The real task screen (questions, timer, recording) is not part of it.
          </p>
          <div className="mt-6">
            <PillButton href="/dashboard" variant="quiet">
              Back to dashboard
            </PillButton>
          </div>
        </Card>
      </main>
    </div>
  );
}

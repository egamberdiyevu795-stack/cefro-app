import Link from "next/link";
import { DemoLabel } from "@/components/ds";
import { Badge } from "@/components/ui/Badge";
import { listSpeakingTasks } from "@/content/speaking";
import { EXAM_PART_IDS, examPartAnchor, examPartLabel, examPartOf } from "@/domain/speaking/exam-part";
import { PART_NAMES } from "@/features/dashboard/progress";
import { isMockQuery } from "@/features/demo/demo-mode";
import { ACCOUNT_DELETED, isAccountDeletedQuery } from "@/features/settings/deleted";
import { practiceHref } from "@/features/speaking-practice/lib/practice-flow";

/**
 * The task list. `?deleted=1` (after "Delete my account"): "Your account and all your data were deleted." on top.
 * `?mock=1` (mock mode): the same list, with the demo label, and every task opens its brief in mock
 * mode (no configuration, no database, nothing is scored). The (site) layout skips its configuration check then.
 */
export default async function HomePage(props: PageProps<"/">) {
  const query = await props.searchParams;
  const mock = isMockQuery(query);
  // After "Delete my account" (never in mock mode, where nothing is deleted).
  const deleted = !mock && isAccountDeletedQuery(query);
  const tasks = listSpeakingTasks();
  // One section per exam part that has tasks; the dashboard's part tiles link to them (`/#part-2`).
  const parts = EXAM_PART_IDS.map((part) => ({ part, tasks: tasks.filter((t) => examPartOf(t) === part) })).filter((p) => p.tasks.length > 0);
  return (
    <div className="space-y-10">
      <section className="max-w-2xl space-y-3">
        {mock && <DemoLabel variant="mode" className="font-ui" />}
        {deleted && (
          <p role="status" data-testid="account-deleted" className="rounded-xl border border-border bg-surface px-4 py-3 text-base font-medium">
            {ACCOUNT_DELETED}
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Speak. Get specific feedback. Try again.</h1>
        <p className="text-lg text-muted">
          Practise CEFR speaking tasks under exam timing. CEFRO shows you exactly what to fix in your own answer — then lets you retry and see whether it worked.
        </p>
      </section>

      <section aria-labelledby="practice-heading" className="space-y-6">
        <h2 id="practice-heading" className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Speaking practice
        </h2>
        {parts.map(({ part, tasks: partTasks }) => (
          <section key={part} id={examPartAnchor(part)} aria-labelledby={`${examPartAnchor(part)}-heading`} className="scroll-mt-24 space-y-4">
            <h3 id={`${examPartAnchor(part)}-heading`} className="text-lg font-semibold">
              {examPartLabel(part)} · {PART_NAMES[part]}
            </h3>
            <ul className="grid gap-4 sm:grid-cols-2">
              {partTasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={practiceHref(task.id, { mock })}
                    className="block h-full rounded-2xl border border-border bg-surface p-6 transition hover:border-brand/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="brand">{task.level}</Badge>
                      <Badge>Speaking · Part {task.part}</Badge>
                    </div>
                    <p className="mt-3 text-lg font-semibold">{task.title}</p>
                    <p className="mt-1 text-sm text-muted">
                      {task.preparationSeconds / 60} min preparation · {task.speakingSeconds / 60} min speaking
                    </p>
                    <p className="mt-4 text-sm font-medium text-brand">Start practice →</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>
    </div>
  );
}

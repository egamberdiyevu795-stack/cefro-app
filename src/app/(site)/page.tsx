import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { listSpeakingTasks } from "@/content/speaking";

export default function HomePage() {
  const tasks = listSpeakingTasks();
  return (
    <div className="space-y-10">
      <section className="max-w-2xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Speak. Get specific feedback. Try again.</h1>
        <p className="text-lg text-muted">
          Practise CEFR speaking tasks under exam timing. CEFRO shows you exactly what to fix in your own answer — then lets you retry and see whether it worked.
        </p>
      </section>

      <section aria-labelledby="practice-heading" className="space-y-4">
        <h2 id="practice-heading" className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Speaking practice
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link
                href={`/practice/speaking/${task.id}`}
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
    </div>
  );
}

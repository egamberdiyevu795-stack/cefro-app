import Link from "next/link";
import { Card, CardHeader, Icon, cx, styles } from "@/components/ds";
import { examPartAnchor, examPartLabel, type ExamPartId } from "@/domain/speaking/exam-part";

export type TaskListRow = { id: string; title: string; href: string; timing: string };
export type TaskListPart = { part: ExamPartId; name: string; level: string; note: string; tasks: TaskListRow[] };

/** "1 min preparation · 2 min speaking" (whole minutes; seconds when a part is shorter than a minute). */
export function timingText(task: { preparationSeconds: number; speakingSeconds: number }): string {
  const time = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s} s`);
  return task.preparationSeconds > 0 ? `${time(task.preparationSeconds)} preparation · ${time(task.speakingSeconds)} speaking` : `${time(task.speakingSeconds)} speaking`;
}

/**
 * The task list (`/practice`, the Practice tab) on the design system: a page heading, then one card per exam part that
 * has tasks (`id="part-2"`: the dashboard's part tile and the Account page's "Go to Part 2" open it). Each row is a
 * link to the task's brief. No black button: choosing a task is the page, as on the Lessons list; the brief's "Start
 * preparation" is the next black button.
 */
export function TaskList({ parts, top }: { parts: TaskListPart[]; /** Above the heading: the demo label in mock mode. */ top?: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4" data-testid="task-list">
      {top}
      <div className="px-1">
        <h1 className="text-title font-medium tracking-[-0.01em] text-fg">Practice</h1>
        <p className="mt-1 text-body text-fg-muted">Choose a task. Speak under exam timing, see your own words quoted, fix one thing and try again.</p>
      </div>
      {parts.map(({ part, name, level, note, tasks }) => {
        const anchor = examPartAnchor(part);
        return (
          <Card key={part} id={anchor} aria-labelledby={`${anchor}-heading`} className="scroll-mt-4">
            <CardHeader
              id={`${anchor}-heading`}
              title={`${examPartLabel(part)} · ${name}`}
              action={<span className="shrink-0 rounded-full bg-well px-2.5 py-1 text-label font-medium text-fg">{level}</span>}
              className="mb-3"
            />
            <p className="text-label text-fg-muted">{note}</p>
            <ul className="mt-2 divide-y divide-line">
              {tasks.map((task) => (
                <li key={task.id}>
                  <Link href={task.href} className={cx("flex min-h-14 items-center gap-3 py-2.5 hover:text-fg", styles.FOCUS_RING)} data-testid="task-link">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-well text-fg">
                      <Icon name="mic" size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-semibold text-fg">{task.title}</span>
                      <span className="block text-caption text-fg-muted">{task.timing}</span>
                    </span>
                    <Icon name="chevronDown" size={16} className="-rotate-90 text-fg-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

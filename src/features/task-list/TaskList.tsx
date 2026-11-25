import Link from "next/link";
import { Card, CardHeader, Icon, cx, styles } from "@/components/ds";
import { examPartAnchor, examPartLabel, type ExamPartId } from "@/domain/speaking/exam-part";

/** A row's small grey tag: one row at most, from the student's own history (never a claim about the exam). */
export type TaskTag = "Start here" | "Try next";

export type TaskListRow = {
  id: string;
  title: string;
  href: string;
  tag?: TaskTag;
  /** Under the title: "Practised 04.11.26" once the student has answered it; nothing before. */
  detail?: string;
  /** SAMPLE only (mock mode, `?freq=1`): a made-up "how often asked" label. */
  frequency?: string;
};

/**
 * - "open": the part is live (`PART_LIVE`): its tasks, each a link to its brief.
 * - "demo": not live, mock mode: its tasks open their mock pages, under a "Coming soon" line.
 * - "soon": not live, real page: the card says "Coming soon" and lists no task (its pages are a 404).
 */
export type TaskListPartStatus = "open" | "demo" | "soon";

/**
 * The part's first row: a topic picked for the student, as in the exam. Parts 1.2, 2 and 3: "Random topic" (never
 * practised first, then the least recent). Part 1.1: its only row, a new question set every time.
 */
export type TaskListRandom = {
  href: string;
  title: string;
  detail: string;
  tag?: TaskTag;
};

export type TaskListPart = {
  part: ExamPartId;
  name: string;
  level: string;
  note: string;
  /** The part's timing, once, in the card header: "1 min to prepare · 2 min to speak". */
  timing: string;
  status: TaskListPartStatus;
  /** The rows carry SAMPLE frequency labels: the card says they are made up. */
  sample?: boolean;
  random?: TaskListRandom;
  /** How many of the listed topics the student has practised (shown as "2 of 7 practised"). */
  practisedCount?: number;
  tasks: TaskListRow[];
};

type Timed = { preparationSeconds: number; speakingSeconds: number; delivery?: { questions: readonly { speakingSeconds: number }[] } };

const time = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s} s`);

/**
 * A part's timing, said once for the whole part (every task of a part has the same timing, checked by the content
 * tests). Part 2 and 3: "1 min to prepare · 2 min to speak". Part 1 (question by question): "3 questions · 30 s each",
 * "3 questions · 45 s for the first, 30 s for the others".
 */
export function timingText(task: Timed): string {
  const questions = task.delivery?.questions;
  if (questions?.length) {
    const [first, ...rest] = questions.map((q) => q.speakingSeconds);
    const count = `${questions.length} question${questions.length === 1 ? "" : "s"}`;
    if (rest.every((s) => s === first)) return `${count} · ${time(first)} each`;
    if (rest.every((s) => s === rest[0])) return `${count} · ${time(first)} for the first, ${time(rest[0])} for the others`;
    return `${count} · ${questions.map((q) => time(q.speakingSeconds)).join(", ")}`;
  }
  return task.preparationSeconds > 0 ? `${time(task.preparationSeconds)} to prepare · ${time(task.speakingSeconds)} to speak` : `${time(task.speakingSeconds)} to speak`;
}

/**
 * The task list (`/practice`, the Practice tab) on the design system: a page heading, then one card per exam part, in
 * exam order (1.1, 1.2, 2, 3; `id="part-2"`: the dashboard's part tile and the Account page's "Go to Part 2" open it).
 * The part's timing is said once, under its title, not on every row. Each row is a link to the task's brief. The "Full
 * mock exam" card above the parts holds the page's one black button (when the mock is open or a demo; "Coming soon" has none):
 * choosing a single task is the page itself, as on the Lessons list; the brief's "Start preparation" is the next black button.
 */
export function TaskList({
  parts,
  top,
  mockCard,
}: {
  parts: TaskListPart[];
  /** Above the heading: the demo label in mock mode. */
  top?: React.ReactNode;
  /** Between the heading and the parts: the "Full mock exam" card, the page's one black button (features/full-mock). */
  mockCard?: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 lg:mx-0" data-testid="task-list">
      {top}
      <div className="px-1">
        <h1 className="text-title font-medium tracking-[-0.01em] text-fg">Practice</h1>
        <p className="mt-1 text-body text-fg-muted">Get a random topic, as in the exam, or choose one to work on. See your own words quoted, fix one thing and try again.</p>
      </div>
      {mockCard}
      {parts.map(({ part, name, level, note, timing, status, sample, random, practisedCount = 0, tasks }) => {
        const anchor = examPartAnchor(part);
        return (
          <Card key={part} id={anchor} aria-labelledby={`${anchor}-heading`} className="scroll-mt-4" data-status={status}>
            <CardHeader
              id={`${anchor}-heading`}
              title={`${examPartLabel(part)} · ${name}`}
              action={<span className="shrink-0 rounded-full bg-well px-2.5 py-1 text-label font-medium text-fg">{level}</span>}
              className="mb-3"
            />
            <p className="text-label text-fg-muted">{note}</p>
            <p className="mt-2 flex items-center gap-1.5 text-label font-medium text-fg" data-testid="part-timing">
              <Icon name="clock" size={14} className="shrink-0 text-fg-muted" />
              {timing}
            </p>
            {status !== "open" && (
              <p className="mt-3 text-label text-fg-muted" data-testid="part-status">
                <span className="font-medium text-fg">Coming soon.</span>
                {status === "demo" ? " You can try the demo below; it is not scored." : null}
              </p>
            )}
            {sample && (tasks.length > 0 || random) && (
              <p className="mt-3 rounded-tile bg-well px-3 py-2 text-label text-fg" data-testid="sample-frequency-note">
                <span className="font-medium">Sample labels.</span> Made up to preview the idea, not real exam data. Sorted from often to rarely asked.
              </p>
            )}
            {random && <RandomRow random={random} />}
            {tasks.length > 0 && (
              <>
                {random && (
                  <p className="mt-5 flex items-baseline justify-between gap-3 text-label" data-testid="choose-topic">
                    <span className="font-medium text-fg">Or choose a topic</span>
                    {status === "open" && (
                      <span className="text-fg-muted">
                        {`${practisedCount} of ${tasks.length} practised`}
                      </span>
                    )}
                  </p>
                )}
                <ul className={cx("divide-y divide-line", random ? "mt-1" : "mt-2")}>
                  {tasks.map((task) => (
                    <li key={task.id}>
                      <Link href={task.href} className={cx("flex min-h-14 items-center gap-3 py-2.5 hover:text-fg", styles.FOCUS_RING)} data-testid="task-link">
                        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-well text-fg">
                          <Icon name={task.detail ? "check" : "mic"} size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-body font-semibold text-fg">{task.title}</span>
                          {(task.frequency || task.detail) && (
                            <span className="block text-caption text-fg-muted">{[task.frequency, task.detail].filter(Boolean).join(" · ")}</span>
                          )}
                        </span>
                        {task.tag && <Tag>{task.tag}</Tag>}
                        <Icon name="chevronDown" size={16} className="-rotate-90 text-fg-subtle" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/** A row's small tag; on the grey random tile it sits on the card colour so it still reads as a pill. */
function Tag({ children, onWell = false }: { children: React.ReactNode; onWell?: boolean }) {
  return (
    <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-label font-medium text-fg", onWell ? "bg-card" : "bg-well")} data-testid="task-tag">
      {children}
    </span>
  );
}

/**
 * The part's first row, on a grey tile so it reads as the suggested way in: a topic picked for the student, as the exam
 * does. A link, not a black button: the page keeps one black button (the mock exam card). Not prefetched, so each tap
 * is a fresh pick.
 */
function RandomRow({ random }: { random: TaskListRandom }) {
  return (
    <Link
      href={random.href}
      prefetch={false}
      className={cx("mt-4 flex min-h-16 items-center gap-3 rounded-tile bg-well px-3 py-3 hover:bg-line", styles.FOCUS_RING)}
      data-testid="random-link"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-fg">
        <Icon name="shuffle" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-fg">{random.title}</span>
        <span className="block text-caption text-fg-muted">{random.detail}</span>
      </span>
      {random.tag && <Tag onWell>{random.tag}</Tag>}
      <Icon name="chevronDown" size={16} className="-rotate-90 text-fg-subtle" />
    </Link>
  );
}

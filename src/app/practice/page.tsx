import type { Metadata } from "next";
import { connection } from "next/server";
import { DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS, PART_LIVE, allFlags, fullMockLive, type FeatureFlags } from "@/config/features";
import { listAllSpeakingTasks } from "@/content/speaking";
import { listArgumentTasks } from "@/content/speaking/part3";
import { EXAM_PART_IDS, examPartOf, type ExamPartId } from "@/domain/speaking/exam-part";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { PART_NAMES, practiseNext } from "@/features/dashboard/progress";
import { isMockQuery, mockLink } from "@/features/demo/demo-mode";
import { MockExamCard, type MockCardState } from "@/features/full-mock/screens";
import { formatDate } from "@/features/history/view-model";
import { part3PracticeHref, part3RealPracticeHref } from "@/features/part3/links";
import { AppShell } from "@/features/shell/AppShell";
import { practiceHref } from "@/features/speaking-practice/lib/practice-flow";
import { byFrequency, sampleFrequency, showSampleFrequency } from "@/features/task-list/sample-frequency";
import { isTopicPart, randomTopicHref } from "@/features/task-list/random-task";
import { TaskList, timingText, type TaskListPart, type TaskListRandom, type TaskListRow } from "@/features/task-list/TaskList";
import { listAttemptHistory } from "@/server/attempts/attempt-service";
import { assertServerConfigured } from "@/server/config/boot-check";
import { demoAttempts } from "@/server/demo/demo-data";
import { findCurrentUserId } from "@/server/identity/current-user";
import { findInProgressMock } from "@/server/sessions/mock-service";

export const metadata: Metadata = { title: "Practice" };

/** One line under each part's title: what the part asks, from the exam format (docs/part1-plan.md, Speaking_format). */
const PART_NOTES: Record<ExamPartId, string> = {
  "1.1": "Three short personal questions, one at a time.",
  "1.2": "Three questions about two pictures.",
  "2": "Three questions and one picture. Answer the questions: describing the picture answers none of them.",
  "3": "One statement with a list of Pros and a list of Cons. Argue both sides.",
};

/** Each part's target level (docs/part1-plan.md: 1.1 targets A2, 1.2 B1). */
const PART_LEVELS: Record<ExamPartId, string> = { "1.1": "A2", "1.2": "B1", "2": "B2", "3": "C1" };

/*
 * The task list (`/practice`, the Practice tab; it used to be the home page), on the design system: the app frame
 * (rail on desktop, bottom bar on phones, Practice as the current tab), a heading, and one card per exam part, all
 * four, in exam order (1.1, 1.2, 2, 3). Each part's timing is said once, under its title.
 *
 * A live part (`PART_LIVE`) lists its tasks, each a link to its brief, where the consent lock (pilot, Part 1 included)
 * and the black "Start preparation" are. A part that is not live says "Coming soon": on the real page with no task
 * (its pages are a 404); in mock mode with its tasks, which open their mock pages (Part 1: the question-by-question
 * flow; Part 3: the Part 3 demo). No black button here.
 *
 * The "Full mock exam" card sits above the parts and holds the page's one black button (docs/v1-plan.md, step 2): "Start mock
 * exam" while all four parts are live (`fullMockLive`), "Continue your mock" when one is in progress, "Try the demo mock" in mock
 * mode, and only the text "Coming soon." (no button) before the real mock is open.
 *
 * "Start here" / "Try next": one live task is tagged, the one the dashboard's Practise next picks (`practiseNext`, from
 * the student's own attempts: an unmet goal first, then a task never practised, then the one practised least
 * recently). "Start here" before any attempt, "Try next" after. A practised task says "Practised dd.mm.yy". No tag
 * or order claims how often a task comes up in the exam: we have no such data.
 *
 * `?mock=1&freq=1`: SAMPLE "Often / Sometimes / Rarely asked" labels, tasks sorted often → rarely, each card saying
 * they are made up (features/task-list/sample-frequency.ts). For the owner to judge the idea; never on the real site.
 *
 * Real page: the full server configuration is checked on every request (it used to come from the `(site)` layout).
 * `?mock=1` (mock mode): no check, the demo student's attempts (no cookie or database read), the demo label, and every
 * link keeps ?mock=1. `?flags=off` previews the frame with every flag off.
 */
export default async function PracticePage(props: PageProps<"/practice">) {
  const query = await props.searchParams;
  const mock = isMockQuery(query);
  await connection();
  if (!mock) assertServerConfigured();
  const flags: FeatureFlags = query.flags === "off" ? allFlags(false) : FEATURE_FLAGS;
  // SAMPLE frequency labels (made up, for the owner to judge the idea): mock mode with ?freq=1 only.
  const sample = showSampleFrequency(mock, query.freq);

  const userId = mock ? null : await findCurrentUserId();
  const attempts: HistoryAttempt[] = mock ? await demoAttempts(new Date()) : userId ? await listAttemptHistory(userId) : [];

  const speaking = listAllSpeakingTasks();
  const liveTasks = speaking.filter((t) => {
    const part = examPartOf(t);
    return part !== null && PART_LIVE[part];
  });
  const liveIds = new Set(liveTasks.map((t) => t.id));
  const practised = attempts.filter((a) => liveIds.has(a.taskId));
  const nextId = practiseNext(practised, liveTasks)?.taskId ?? null;
  const tag = practised.length > 0 ? "Try next" : "Start here";
  const lastPractised = (taskId: string) => practised.find((a) => a.taskId === taskId)?.createdAt ?? null;
  const lastPractisedAny = (taskId: string) => attempts.find((a) => a.taskId === taskId)?.createdAt ?? null;
  // Every topic the student has answered (Part 3 included), for "2 of 7 practised".
  const practisedIds = new Set(attempts.map((a) => a.taskId));
  // Part 1.1's attempts carry their set's id; its one row says when the last set was answered.
  const lastPart11 = attempts.find((a) => a.part === "1.1")?.createdAt ?? null;

  /**
   * The part's first row (features/task-list/random-task.ts). Part 1.1: its one entry, a new question set each time,
   * keeping its "Start here" / "Try next" tag. Parts 1.2, 2 and 3: "Random topic".
   */
  const randomRow = (part: ExamPartId, rows: TaskListRow[], { live, mock }: { live: boolean; mock: boolean }): TaskListRandom | undefined => {
    if (part === "1.1") {
      const entry = rows[0];
      if (!entry) return undefined;
      const last = live ? lastPart11 : null;
      return {
        href: entry.href,
        title: "Random questions",
        detail: last ? `New questions every time · Practised ${formatDate(last)}` : "New questions every time, as in the exam",
        tag: entry.tag,
      };
    }
    if (!isTopicPart(part) || rows.length < 2) return undefined;
    return { href: randomTopicHref(part, { mock }), title: "Random topic", detail: "Picked for you, as in the exam. New topics first." };
  };

  const parts: TaskListPart[] = EXAM_PART_IDS.map((part) => {
    const live = PART_LIVE[part];
    const status = live ? "open" : mock ? "demo" : "soon";
    const timed = part === "3" ? listArgumentTasks() : speaking.filter((t) => examPartOf(t) === part);
    const rows: TaskListRow[] =
      status === "soon"
        ? []
        : part === "3"
          ? listArgumentTasks().map((t) => {
              const last = live ? lastPractisedAny(t.id) : null;
              return {
                id: t.id,
                title: t.title,
                href: live && !mock ? part3RealPracticeHref(t.id) : part3PracticeHref(t.id),
                detail: last ? `Practised ${formatDate(last)}` : undefined,
              };
            })
          : speaking
              .filter((t) => examPartOf(t) === part)
              .map((t) => {
                const last = live ? lastPractised(t.id) : null;
                return {
                  id: t.id,
                  title: t.title,
                  href: practiceHref(t.id, { mock }),
                  tag: live && t.id === nextId ? tag : undefined,
                  detail: last ? `Practised ${formatDate(last)}` : undefined,
                };
              });
    const shown = sample ? byFrequency(rows).map((r) => ({ ...r, frequency: sampleFrequency(r.id) })) : rows;
    const random = status === "soon" ? undefined : randomRow(part, shown, { live, mock });
    return {
      part,
      name: PART_NAMES[part],
      level: PART_LEVELS[part],
      note: PART_NOTES[part],
      timing: timed[0] ? timingText(timed[0]) : "",
      status,
      sample,
      random,
      // Part 1.1 has no list: its one row is the random one.
      tasks: part === "1.1" ? [] : shown,
      practisedCount: live ? shown.filter((r) => practisedIds.has(r.id)).length : 0,
    };
  });
  const live = fullMockLive();
  const inProgress = !mock && live && userId ? await findInProgressMock(userId) : null;
  const mockState: MockCardState = mock
    ? { kind: "demo", href: mockLink("/practice/mock", true), soon: !live }
    : !live
      ? { kind: "soon" }
      : inProgress
        ? { kind: "continue", href: "/practice/mock", done: inProgress.parts.filter((p) => p.attemptId).map((p) => p.part) }
        : { kind: "start", href: "/practice/mock" };

  return (
    <AppShell flags={flags} account={mock ? "mock" : "real"} back={false} activeHref="/practice">
      <TaskList parts={parts} top={mock && <DemoLabel variant="mode" className="justify-self-start bg-card" />} mockCard={<MockExamCard state={mockState} />} />
    </AppShell>
  );
}

import type { Metadata } from "next";
import { connection } from "next/server";
import { DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS, allFlags, type FeatureFlags } from "@/config/features";
import { listSpeakingTasks } from "@/content/speaking";
import { EXAM_PART_IDS, examPartOf, type ExamPartId } from "@/domain/speaking/exam-part";
import { PART_NAMES } from "@/features/dashboard/progress";
import { isMockQuery } from "@/features/demo/demo-mode";
import { AppShell } from "@/features/shell/AppShell";
import { practiceHref } from "@/features/speaking-practice/lib/practice-flow";
import { TaskList, timingText, type TaskListPart } from "@/features/task-list/TaskList";
import { assertServerConfigured } from "@/server/config/boot-check";

export const metadata: Metadata = { title: "Practice" };

/** One line under each part's title: what the part asks, from the exam format (docs/part1-plan.md, Speaking_format). */
const PART_NOTES: Record<ExamPartId, string> = {
  "1.1": "Three short personal questions, one at a time.",
  "1.2": "Three questions about two pictures.",
  "2": "Three questions and one picture. Answer the questions: describing the picture answers none of them.",
  "3": "One statement with a FOR and an AGAINST list. Argue both sides.",
};

/*
 * The task list (`/practice`, the Practice tab; it used to be the home page), on the design system: the app frame
 * (rail on desktop, bottom bar on phones, Practice as the current tab), a heading, and one card per exam part with
 * tasks (`listSpeakingTasks`: Part 2 today; Part 1 joins when its parts go live). Each row opens the task's brief,
 * where the consent lock (pilot) and the black "Start preparation" are. No black button here.
 *
 * Real page: the full server configuration is checked on every request (it used to come from the `(site)` layout).
 * `?mock=1` (mock mode): no check, the demo account, the demo label, and every link keeps ?mock=1. `?flags=off`
 * previews the frame with every flag off.
 */
export default async function PracticePage(props: PageProps<"/practice">) {
  const query = await props.searchParams;
  const mock = isMockQuery(query);
  if (!mock) {
    await connection();
    assertServerConfigured();
  }
  const flags: FeatureFlags = query.flags === "off" ? allFlags(false) : FEATURE_FLAGS;
  const tasks = listSpeakingTasks();
  const parts: TaskListPart[] = EXAM_PART_IDS.map((part) => {
    const partTasks = tasks.filter((t) => examPartOf(t) === part);
    return {
      part,
      name: PART_NAMES[part],
      level: partTasks[0]?.level ?? "",
      note: PART_NOTES[part],
      tasks: partTasks.map((t) => ({ id: t.id, title: t.title, href: practiceHref(t.id, { mock }), timing: timingText(t) })),
    };
  }).filter((p) => p.tasks.length > 0);

  return (
    <AppShell flags={flags} account={mock ? "mock" : "real"} activeHref="/practice">
      <TaskList parts={parts} top={mock && <DemoLabel variant="mode" className="justify-self-start bg-card" />} />
    </AppShell>
  );
}

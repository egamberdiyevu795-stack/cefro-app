import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FEATURE_FLAGS, allFlags, type FeatureFlags } from "@/config/features";
import { part3Intro } from "@/content/speaking/c1/part3-intro-audio";
import { getArgumentTask } from "@/content/speaking/part3";
import { toPublicArgumentTask } from "@/domain/speaking/argument-task";
import { isMockQuery } from "@/features/demo/demo-mode";
import { Part3Practice } from "@/features/part3/Part3Practice";
import { parsePart3Key } from "@/features/part3/links";
import { AppShell } from "@/features/shell/AppShell";
import { part3DemoEvaluation } from "@/server/demo/part3-demo";

export async function generateMetadata(props: PageProps<"/practice/part3/[taskId]">): Promise<Metadata> {
  const { taskId } = await props.params;
  const task = getArgumentTask(taskId);
  return { title: task ? `C1 Speaking Part 3: ${task.title}` : "Task not found" };
}

/*
 * A Part 3 practice, mock mode only (`?mock=1`; Part 3 is not live, see ../page.tsx): brief → preparation (choose two
 * points per side) → recording → the demo result for the points chosen.
 *   ?mock=1&retry=<demo key>   a retry of that demo result (same topic): its goal on every screen, its points ticked.
 *   ?mock=1&timeScale=0.05     browser tests only: shorter preparation and speaking time (never the audio).
 */
export default async function Part3PracticePage(props: PageProps<"/practice/part3/[taskId]">) {
  const [{ taskId }, query] = await Promise.all([props.params, props.searchParams]);
  if (!isMockQuery(query)) notFound();
  const task = getArgumentTask(taskId);
  if (!task) notFound();
  const flags: FeatureFlags = query.flags === "off" ? allFlags(false) : FEATURE_FLAGS;

  // A retry of a demo result of this topic; anything else opens a first practice.
  const retryKey = typeof query.retry === "string" ? query.retry : null;
  const parsed = retryKey ? parsePart3Key(retryKey) : null;
  const previous = parsed && parsed.taskId === task.id ? await part3DemoEvaluation(retryKey!) : null;
  const focus = previous?.result.retry_focus[0];
  const scale = Number(typeof query.timeScale === "string" ? query.timeScale : NaN);

  return (
    <AppShell flags={flags} account="mock">
      <Part3Practice
        task={toPublicArgumentTask(task)}
        retryOf={previous ? retryKey : null}
        goal={focus ? { objective: focus.objective, check: focus.success_check || null } : null}
        initialChosen={previous ? previous.result.chosen_points : []}
        intro={part3Intro(task)}
        timeScale={scale > 0 && scale <= 1 ? scale : 1}
      />
    </AppShell>
  );
}

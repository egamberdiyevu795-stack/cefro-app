import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getSpeakingTask } from "@/content/speaking";
import { FEATURE_FLAGS, allFlags, type FeatureFlags } from "@/config/features";
import { toPublicTask } from "@/domain/speaking/task";
import { mockAttemptKey, mockRetryAttempt } from "@/features/result/mock-data";
import { AppShell } from "@/features/shell/AppShell";
import { PracticeExperience } from "@/features/speaking-practice/components/PracticeExperience";
import { assertServerConfigured } from "@/server/config/boot-check";

export async function generateMetadata(props: PageProps<"/practice/speaking/[taskId]">): Promise<Metadata> {
  const { taskId } = await props.params;
  const task = getSpeakingTask(taskId);
  return { title: task ? `${task.level} Speaking Part ${task.part}: ${task.title}` : "Task not found" };
}

/*
 * The practice flow (brief → preparation → recording → scoring) on the design system.
 *
 * Switches:
 *   ?retry=<attempt id>   open as a retry of that attempt: its goal is shown on every screen and sent with the answer
 *   ?mock=1               mock mode: no session, history, analytics or upload; Finish opens the result page's mock
 *                         "Scoring…", then the mock result. Needs no API key or database.
 *   ?mock=1&retry=<fixture id>&run=1..3   a mock retry of a saved live run (its first retry focus is the goal)
 *   ?flags=off            every feature flag off
 */
export default async function SpeakingPracticePage(props: PageProps<"/practice/speaking/[taskId]">) {
  const [{ taskId }, query] = await Promise.all([props.params, props.searchParams]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const mock = one(query.mock) === "1";
  const flags: FeatureFlags = one(query.flags) === "off" ? allFlags(false) : FEATURE_FLAGS;

  // The real flow needs the full server configuration (it used to get this check from the (site) layout); mock mode
  // calls no API and runs anywhere.
  if (!mock) {
    await connection();
    assertServerConfigured();
  }

  const speakingTask = getSpeakingTask(taskId);
  if (!speakingTask) notFound();
  // Only the public part of the task reaches the browser (no evaluator guidance).
  const task = toPublicTask(speakingTask);

  const retry = one(query.retry);
  const mockRetry = mock ? mockAttemptKey(retry, one(query.run)) : null;

  return (
    // The real flow shows the signed-in student's account; mock mode the mocked one.
    <AppShell flags={flags} account={mock ? "mock" : "real"}>
      <PracticeExperience
        task={task}
        flags={flags}
        mock={mock ? { retry: mockRetry } : null}
        initialRetryOf={mockRetry ? mockRetryAttempt(mockRetry, task) : null}
        retryAttemptId={!mock && retry ? retry : null}
      />
    </AppShell>
  );
}

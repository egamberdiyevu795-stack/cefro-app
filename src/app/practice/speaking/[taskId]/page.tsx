import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getSpeakingTask } from "@/content/speaking";
import { FEATURE_FLAGS, allFlags, type FeatureFlags } from "@/config/features";
import { toPublicTask } from "@/domain/speaking/task";
import { demoAttemptView, demoResultSpec } from "@/server/demo/demo-data";
import { mockAttemptKey, mockRetryAttempt } from "@/features/result/mock-data";
import { AppShell } from "@/features/shell/AppShell";
import { PracticeExperience } from "@/features/speaking-practice/components/PracticeExperience";
import { Part1Experience } from "@/features/speaking-practice/components/Part1Experience";
import { toQuestionSequenceTask } from "@/content/speaking/part1";
import { isTaskLive } from "@/config/part-live";
import { assertServerConfigured } from "@/server/config/boot-check";
import { parseLockPreview } from "@/domain/consent";
import { consentRequired, recordingLockFor } from "@/server/consent/consent";
import { findCurrentUserId } from "@/server/identity/current-user";
import { PART11_BANK_ENTRY_ID } from "@/content/speaking/part1/part1-1-sets";
import { pickPart11SetForUser } from "@/server/sessions/mock-service";

export async function generateMetadata(props: PageProps<"/practice/speaking/[taskId]">): Promise<Metadata> {
  const { taskId } = await props.params;
  const task = getSpeakingTask(taskId);
  const part = task?.delivery ? (task.level === "A2" ? "1.1" : "1.2") : task?.part;
  return { title: task ? `${task.level} Speaking Part ${part}: ${task.title}` : "Task not found" };
}

/*
 * The practice flow (brief → preparation → recording → scoring) on the design system.
 *
 * Switches:
 *   ?retry=<attempt id>   open as a retry of that attempt: its goal is shown on every screen and sent with the answer
 *   ?mock=1               mock mode: no session, history, analytics or upload; Finish opens the result page's mock
 *                         "Scoring…", then the mock result. Needs no API key or database.
 *   ?mock=1&retry=<fixture id>&run=1..3   a mock retry of a saved live run (its first retry focus is the goal)
 *   ?mock=1&retry=<demo key>              a mock retry of a demo result of this task (server/demo/demo-data.ts)
 *   In mock mode, Finish opens this task's demo result (a retry of a fixture: the saved runs' retry result).
 *   ?flags=off            every feature flag off
 *   ?mock=1&consent=waiting|withdrawn|guest   mock mode: preview the locked screen (pilot consent). Nothing is read.
 *
 * Part 1.1 / 1.2 tasks (a task with `delivery`) open the question-by-question flow (Part1Experience). Their parts are
 * not live yet (`PART_LIVE`), so their real page is a 404; mock mode (?mock=1) opens them, with
 * ?mock=1&retry=<demo key> for a retry and ?mock=1&timeScale=0.05 (browser tests only) for shortened timings.
 *
 * Pilot consent (CONSENT_REQUIRED): the real page asks the server whether the caller may record; when not, the brief
 * shows the lock instead of Start preparation. Mock mode never locks unless `?consent=` asks for the preview.
 */
export default async function SpeakingPracticePage(props: PageProps<"/practice/speaking/[taskId]">) {
  const [{ taskId }, query] = await Promise.all([props.params, props.searchParams]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const mock = one(query.mock) === "1";
  const flags: FeatureFlags = one(query.flags) === "off" ? allFlags(false) : FEATURE_FLAGS;

  // Part 1.1's card on the task list opens a fresh question set, picked by how often each question is asked
  // (content/speaking/part1/part1-1-sets.ts). The set's own page keeps every switch (?mock=1, ?timeScale=…), and a retry
  // stays on the same set because a set's id names its questions.
  if (taskId === PART11_BANK_ENTRY_ID && !one(query.retry)) {
    await connection();
    const setId = await pickPart11SetForUser(mock ? null : await findCurrentUserId());
    const rest = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) rest.append(key, v);
    redirect(`/practice/speaking/${setId}${rest.size > 0 ? `?${rest}` : ""}`);
  }

  // The real flow needs the full server configuration (it used to get this check from the (site) layout); mock mode
  // calls no API and runs anywhere.
  const speakingTask = getSpeakingTask(taskId);
  if (!speakingTask) notFound();
  // A part that is not live has no real page (mock mode shows it), whatever the server's configuration.
  if (!mock && !isTaskLive(speakingTask)) notFound();
  if (!mock) {
    await connection();
    assertServerConfigured();
  }
  // Only the public part of the task reaches the browser (no evaluator guidance).
  const task = toPublicTask(speakingTask);

  const retry = one(query.retry);
  const mockRetry = mock ? mockAttemptKey(retry, one(query.run)) : null;
  // A demo result of this task (a retry of another task's result is ignored).
  const demoRetry = mock && !mockRetry && retry && demoResultSpec(retry)?.task.id === task.id ? await demoAttemptView(retry) : null;

  // Pilot consent. The page only reads (findCurrentUserId creates no identity); a browser with none is a guest.
  // With the switch off nothing is read at all.
  const lock = mock ? parseLockPreview(one(query.consent)) : consentRequired() ? await recordingLockFor(await findCurrentUserId()) : null;

  if (speakingTask.delivery) {
    const scale = Number(one(query.timeScale));
    return (
      <AppShell flags={flags} account={mock ? "mock" : "real"}>
        <Part1Experience
          task={task}
          sequence={toQuestionSequenceTask(speakingTask)}
          mock={mock ? { demoRetry: demoRetry?.id ?? null } : null}
          initialRetryOf={demoRetry}
          retryAttemptId={!mock && retry ? retry : null}
          lock={lock}
          timeScale={mock && scale > 0 && scale <= 1 ? scale : 1}
        />
      </AppShell>
    );
  }

  return (
    // The real flow shows the signed-in student's account; mock mode the mocked one.
    <AppShell flags={flags} account={mock ? "mock" : "real"}>
      <PracticeExperience
        task={task}
        mock={mock ? { retry: mockRetry, demoRetry: demoRetry?.id ?? null } : null}
        initialRetryOf={mockRetry ? mockRetryAttempt(mockRetry, task) : demoRetry}
        retryAttemptId={!mock && retry ? retry : null}
        lock={lock}
      />
    </AppShell>
  );
}

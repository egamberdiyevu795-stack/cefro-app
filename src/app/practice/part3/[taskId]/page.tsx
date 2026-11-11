import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FEATURE_FLAGS, PART_LIVE, allFlags, type FeatureFlags } from "@/config/features";
import { PART3_INTRO } from "@/content/speaking/part-intro-audio";
import { getArgumentTask } from "@/content/speaking/part3";
import { isMultilevelQ8 } from "@/domain/evaluation/stored";
import { parseLockPreview } from "@/domain/consent";
import { toPublicArgumentTask } from "@/domain/speaking/argument-task";
import { isMockQuery } from "@/features/demo/demo-mode";
import { Part3Practice } from "@/features/part3/Part3Practice";
import { parsePart3Key } from "@/features/part3/links";
import { AppShell } from "@/features/shell/AppShell";
import { assertServerConfigured } from "@/server/config/boot-check";
import { consentRequired, recordingLockFor } from "@/server/consent/consent";
import { part3DemoEvaluation } from "@/server/demo/part3-demo";
import { HttpError } from "@/server/errors";
import { findCurrentUserId } from "@/server/identity/current-user";
import { getAttemptViewForUser } from "@/server/attempts/attempt-service";

export async function generateMetadata(props: PageProps<"/practice/part3/[taskId]">): Promise<Metadata> {
  const { taskId } = await props.params;
  const task = getArgumentTask(taskId);
  return { title: task ? `C1 Speaking Part 3: ${task.title}` : "Task not found" };
}

/*
 * A Part 3 practice.
 *   ?mock=1                      mock mode (always available): brief → preparation (choose two points per side) →
 *                                recording → the demo result for the points chosen. Nothing is sent.
 *   ?mock=1&retry=<demo key>     a retry of that demo result (same topic): its goal on every screen, its points ticked.
 *   ?mock=1&timeScale=0.05       browser tests only: shorter preparation and speaking time (never the audio).
 *   (no mock)                    the REAL flow, only while `PART_LIVE["3"]` is on (a 404 otherwise): Finish uploads
 *                                the recording and opens /result/<attempt id>. `?retry=<attempt id>` retries the
 *                                caller's own attempt (its goal and points are read on the server, owner only).
 *   ?mock=1&consent=waiting|withdrawn|guest   mock mode: preview the locked screen (pilot consent).
 * The pilot consent lock (CONSENT_REQUIRED) is decided on the server here and refused again by the upload route.
 */
export default async function Part3PracticePage(props: PageProps<"/practice/part3/[taskId]">) {
  const [{ taskId }, query] = await Promise.all([props.params, props.searchParams]);
  const task = getArgumentTask(taskId);
  if (!task) notFound();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const flags: FeatureFlags = query.flags === "off" ? allFlags(false) : FEATURE_FLAGS;

  if (!isMockQuery(query)) {
    // Real flow: only when Part 3 is live.
    if (!PART_LIVE["3"]) notFound();
    await connection();
    assertServerConfigured();
    const userId = await findCurrentUserId();
    const lock = consentRequired() ? await recordingLockFor(userId) : null;

    // A retry of the caller's own Part 3 attempt of this topic; anything else opens a first practice.
    const retryId = one(query.retry);
    let previous: Awaited<ReturnType<typeof getAttemptViewForUser>> | null = null;
    if (retryId && userId) {
      try {
        const found = await getAttemptViewForUser(userId, retryId);
        previous = found.taskId === task.id ? found : null;
      } catch (error) {
        if (!(error instanceof HttpError && error.status === 404)) throw error;
      }
    }
    const result = previous?.evaluation && isMultilevelQ8(previous.evaluation.result) ? previous.evaluation.result : null;
    const focus = result?.retry_focus[0];
    return (
      <AppShell flags={flags} account="real">
        <Part3Practice
          mode="real"
          task={toPublicArgumentTask(task)}
          lock={lock}
          retryOf={null}
          retryAttemptId={result && previous ? previous.id : null}
          goal={focus ? { objective: focus.objective, check: focus.success_check || null } : null}
          initialChosen={result?.chosen_points ?? []}
          intro={PART3_INTRO}
        />
      </AppShell>
    );
  }

  // A retry of a demo result of this topic; anything else opens a first practice.
  const retryKey = typeof query.retry === "string" ? query.retry : null;
  const parsed = retryKey ? parsePart3Key(retryKey) : null;
  const previous = parsed && parsed.taskId === task.id ? await part3DemoEvaluation(retryKey!) : null;
  const focus = previous?.result.retry_focus[0];
  const scale = Number(typeof query.timeScale === "string" ? query.timeScale : NaN);
  const lock = parseLockPreview(one(query.consent));

  return (
    <AppShell flags={flags} account="mock">
      <Part3Practice
        task={toPublicArgumentTask(task)}
        lock={lock}
        retryOf={previous ? retryKey : null}
        goal={focus ? { objective: focus.objective, check: focus.success_check || null } : null}
        initialChosen={previous ? previous.result.chosen_points : []}
        intro={PART3_INTRO}
        timeScale={scale > 0 && scale <= 1 ? scale : 1}
      />
    </AppShell>
  );
}

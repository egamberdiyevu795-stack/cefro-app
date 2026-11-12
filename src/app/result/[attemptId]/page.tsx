import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FEATURE_FLAGS } from "@/config/features";
import { getSpeakingTask } from "@/content/speaking";
import { getArgumentTask } from "@/content/speaking/part3";
import { toPublicArgumentTask } from "@/domain/speaking/argument-task";
import type { AttemptView } from "@/domain/speaking/attempt";
import { toPublicTask } from "@/domain/speaking/task";
import { Part3AttemptResult } from "@/features/part3/Part3AttemptResult";
import { AttemptResult } from "@/features/result/AttemptResult";
import { AppShell } from "@/features/shell/AppShell";
import { getAttemptViewForUser } from "@/server/attempts/attempt-service";
import { assertServerConfigured } from "@/server/config/boot-check";
import { HttpError } from "@/server/errors";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { getArgumentRubric } from "@/server/evaluation/rubrics/q8";
import { findCurrentUserId } from "@/server/identity/current-user";
import { teacherLevelOfOwnAttempt } from "@/server/teacher/student-view";

export const metadata: Metadata = { title: "Your result" };

/** The caller's own attempt, or null: missing, malformed and other people's attempts all look the same (404). */
async function ownAttempt(userId: string, attemptId: string): Promise<AttemptView | null> {
  try {
    return await getAttemptViewForUser(userId, attemptId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error; // e.g. the database is unreachable: the error screen, not "not found"
  }
}

/*
 * One attempt's result at its own address, so a reload or a link reopens it. Only its owner (the signed-in account,
 * or the browser's anonymous identity) can open it; anyone else gets the not-found screen (404), exactly as the API
 * answers. The ownership check is the API's own (`getAttemptViewForUser`).
 */
export default async function AttemptResultPage(props: PageProps<"/result/[attemptId]">) {
  await connection();
  assertServerConfigured();
  const { attemptId } = await props.params;

  const userId = await findCurrentUserId();
  const attempt = userId ? await ownAttempt(userId, attemptId) : null;
  if (!userId || !attempt) notFound();
  const previous = attempt.previousAttemptId ? await ownAttempt(userId, attempt.previousAttemptId) : null;

  // Part 3 (balanced argument) has its own result page; the attempt, owner check and polling are the same.
  const argumentTask = getArgumentTask(attempt.taskId);
  const bandLabelsOf = (bands: readonly { band: number; label: string }[]) => bands.map(({ band, label }) => ({ band, label }));
  if (argumentTask) {
    const labels = bandLabelsOf(getArgumentRubric(argumentTask).config.bands);
    const teacher = await teacherLevelOfOwnAttempt(attempt.id, labels);
    return (
      <AppShell flags={FEATURE_FLAGS} account="real">
        <Part3AttemptResult
          initial={attempt}
          previous={previous}
          task={toPublicArgumentTask(argumentTask)}
          bandLabels={labels}
          yourTeacher={teacher?.level ?? null}
        />
      </AppShell>
    );
  }

  const speakingTask = getSpeakingTask(attempt.taskId);
  if (!speakingTask) notFound();
  const labels = bandLabelsOf(getSpeakingRubric(speakingTask).config.bands);
  const teacher = await teacherLevelOfOwnAttempt(attempt.id, labels);

  return (
    <AppShell flags={FEATURE_FLAGS} account="real">
      <AttemptResult
        initial={attempt}
        previous={previous}
        task={toPublicTask(speakingTask)}
        bandLabels={labels}
        yourTeacher={teacher?.level ?? null}
      />
    </AppShell>
  );
}

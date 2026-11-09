import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FEATURE_FLAGS } from "@/config/features";
import { getSpeakingTask } from "@/content/speaking";
import type { AttemptView } from "@/domain/speaking/attempt";
import { toPublicTask } from "@/domain/speaking/task";
import { AttemptResult } from "@/features/result/AttemptResult";
import { AppShell } from "@/features/shell/AppShell";
import { getAttemptViewForUser } from "@/server/attempts/attempt-service";
import { assertServerConfigured } from "@/server/config/boot-check";
import { HttpError } from "@/server/errors";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { findCurrentUserId } from "@/server/identity/current-user";

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
  const speakingTask = getSpeakingTask(attempt.taskId);
  if (!speakingTask) notFound();
  const previous = attempt.previousAttemptId ? await ownAttempt(userId, attempt.previousAttemptId) : null;

  return (
    <AppShell flags={FEATURE_FLAGS} account="real">
      <AttemptResult
        initial={attempt}
        previous={previous}
        task={toPublicTask(speakingTask)}
        bandLabels={getSpeakingRubric(speakingTask).config.bands.map(({ band, label }) => ({ band, label }))}
      />
    </AppShell>
  );
}

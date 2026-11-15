import { after } from "next/server";
import { claimAttempt, runClaimedAttempt } from "@/server/attempts/attempt-processing";
import { getAttemptViewForUser, getOwnedAttempt } from "@/server/attempts/attempt-service";
import { findRecording } from "@/server/attempts/attempt-repository";
import { isAttemptStalled } from "@/server/attempts/attempt-views";
import { HttpError } from "@/server/errors";
import { assertCanRecord } from "@/server/consent/consent";
import { withErrorHandling } from "@/server/http";
import { assertCanRestart } from "@/server/limits/usage-limits";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";

export const maxDuration = 300;

/**
 * (Re)start processing for a failed or stalled attempt. The stored audio
 * is reused, so the student does not need to record again. Idempotent:
 * an attempt that is already processing or completed is left alone.
 */
export const POST = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/speaking/attempts/[attemptId]/process">) => {
    const { attemptId } = await ctx.params;
    const userId = await getOrCreateCurrentUserId();
    const attempt = await getOwnedAttempt(userId, attemptId);
    // Scoring a stored answer again also needs consent (it sends the recording to the scoring providers).
    await assertCanRecord(userId);
    // Only a restart that would actually run needs a run left; completed/in-progress attempts stay a no-op.
    if (attempt.status === "failed" || isAttemptStalled(attempt)) {
      assertCanRestart(attempt);
      // After 30 days the recording is gone (audio retention): there is nothing left to score.
      if ((await findRecording(attemptId))?.audioDeletedAt) {
        throw new HttpError(409, "audio_deleted", "This recording was deleted after 30 days, so it can't be scored again. Please record a new answer.");
      }
    }

    const started = await claimAttempt(attemptId);
    if (started) after(() => runClaimedAttempt(attemptId));
    return Response.json(
      { started, attempt: await getAttemptViewForUser(userId, attemptId) },
      { status: started ? 202 : 200 },
    );
  },
);

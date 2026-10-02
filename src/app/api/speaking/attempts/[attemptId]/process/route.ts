import { after } from "next/server";
import { claimAttempt, runClaimedAttempt } from "@/server/attempts/attempt-processing";
import { getAttemptViewForUser, getOwnedAttempt } from "@/server/attempts/attempt-service";
import { withErrorHandling } from "@/server/http";
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
    getOwnedAttempt(userId, attemptId);

    const started = claimAttempt(attemptId);
    if (started) after(() => runClaimedAttempt(attemptId));
    return Response.json(
      { started, attempt: getAttemptViewForUser(userId, attemptId) },
      { status: started ? 202 : 200 },
    );
  },
);

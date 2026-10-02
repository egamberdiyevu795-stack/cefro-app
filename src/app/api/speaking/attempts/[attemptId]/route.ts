import { getAttemptViewForUser } from "@/server/attempts/attempt-service";
import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";

/** Current state of an attempt (status, transcript, evaluation). Polled by the client. */
export const GET = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/speaking/attempts/[attemptId]">) => {
    const { attemptId } = await ctx.params;
    const userId = await getOrCreateCurrentUserId();
    return Response.json({ attempt: getAttemptViewForUser(userId, attemptId) });
  },
);

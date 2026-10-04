import { listAttemptSummaries } from "@/server/attempts/attempt-service";
import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";

/** The current user's attempts for a task, newest first. */
export const GET = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/speaking/tasks/[taskId]/attempts">) => {
    const { taskId } = await ctx.params;
    const userId = await getOrCreateCurrentUserId();
    return Response.json({ attempts: await listAttemptSummaries(userId, taskId) });
  },
);

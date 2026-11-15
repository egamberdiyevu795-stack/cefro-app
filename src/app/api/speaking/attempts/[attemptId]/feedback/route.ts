import { saveFeedbackHelpful } from "@/server/attempts/attempt-service";
import { HttpError } from "@/server/errors";
import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";

/**
 * "Was this feedback helpful?" on the result page. `POST { "helpful": true | false }` for the caller's own scored
 * attempt. One answer per attempt: the first is kept, and the stored answer is returned (`{ "helpful": … }`).
 * Another user's attempt, or a missing one, is 404 like every attempt route.
 */
export const POST = withErrorHandling(
  async (request: Request, ctx: RouteContext<"/api/speaking/attempts/[attemptId]/feedback">) => {
    const { attemptId } = await ctx.params;
    const body = (await request.json().catch(() => null)) as { helpful?: unknown } | null;
    if (!body || typeof body !== "object") throw new HttpError(400, "invalid_body", "Answer Yes or No.");
    const userId = await getOrCreateCurrentUserId();
    const saved = await saveFeedbackHelpful(userId, attemptId, body.helpful);
    return Response.json(saved, { headers: { "Cache-Control": "no-store" } });
  },
);

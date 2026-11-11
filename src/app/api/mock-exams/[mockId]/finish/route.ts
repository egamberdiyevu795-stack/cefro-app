import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";
import { finishMock } from "@/server/sessions/mock-service";

/**
 * Mark the caller's mock "finished" once all four parts have been sent. Safe to repeat. 409 `mock_incomplete` before
 * that, `mock_not_in_progress` after the 24 hours; 404 for anyone else's.
 */
export const POST = withErrorHandling(async (_request: Request, context: RouteContext<"/api/mock-exams/[mockId]/finish">) => {
  const { mockId } = await context.params;
  const userId = await getOrCreateCurrentUserId();
  return Response.json({ mock: await finishMock(userId, mockId) });
});

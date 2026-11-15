import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";
import { getMockResult } from "@/server/sessions/mock-result";

/**
 * The caller's own mock as the mock result page reads it: the four parts in exam order, each with its state ("scoring" until
 * it has a band), its band when scored, its teacher's level when one rated it, and the biggest fix of the weakest part. The
 * page polls this while a part is still being scored. 404 `mock_not_found` for anyone else's mock, a single-task session or a
 * malformed id: the same answer as `GET /api/mock-exams/[mockId]`.
 */
export const GET = withErrorHandling(async (_request: Request, context: RouteContext<"/api/mock-exams/[mockId]/result">) => {
  const { mockId } = await context.params;
  const userId = await getOrCreateCurrentUserId();
  return Response.json({ result: await getMockResult(userId, mockId) });
});

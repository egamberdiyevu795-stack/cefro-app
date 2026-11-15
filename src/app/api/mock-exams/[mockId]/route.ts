import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";
import { getMock } from "@/server/sessions/mock-service";

/** The caller's own mock exam: its status and the four parts (which are done, with their attempt ids). 404 for anyone else's. */
export const GET = withErrorHandling(async (_request: Request, context: RouteContext<"/api/mock-exams/[mockId]">) => {
  const { mockId } = await context.params;
  const userId = await getOrCreateCurrentUserId();
  return Response.json({ mock: await getMock(userId, mockId) });
});

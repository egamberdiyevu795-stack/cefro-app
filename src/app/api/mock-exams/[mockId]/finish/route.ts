import { withErrorHandling } from "@/server/http";
import { actingUser } from "@/server/exam-laptop/acting-user";
import { assertPassSession, finishPassMock } from "@/server/exam-laptop/exam-store";
import { finishMock } from "@/server/sessions/mock-service";

/**
 * Mark the caller's mock "finished" once all four parts have been sent. Safe to repeat. 409 `mock_incomplete` before
 * that, `mock_not_in_progress` after the 24 hours; 404 for anyone else's.
 */
export const POST = withErrorHandling(async (request: Request, context: RouteContext<"/api/mock-exams/[mockId]/finish">) => {
  const { mockId } = await context.params;
  const { userId, pass } = await actingUser(request);
  if (pass) {
    // A pass finishes only the mock it started; that also uses the pass up (the end screen).
    assertPassSession(pass, mockId);
    return Response.json({ mock: await finishPassMock(pass) });
  }
  return Response.json({ mock: await finishMock(userId, mockId) });
});

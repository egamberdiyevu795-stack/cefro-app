import { json, readJson, teacherRoute } from "@/server/teacher/routes";
import { rateAttempt } from "@/server/teacher/teacher-service";

/**
 * "Your view" on a shared attempt: `PUT { agrees: true }` (Agree) or `{ agrees: false, band }` (Choose level, 0 to the
 * part's top band). Saved beside the app's band; never read by the scorer, result page, dashboard or History.
 */
export const PUT = teacherRoute("teacher", async (request, ctx: RouteContext<"/api/teacher/classes/[classId]/attempts/[attemptId]/rating">, userId) => {
  const { classId, attemptId } = await ctx.params;
  return json({ rating: await rateAttempt(userId, classId, attemptId, await readJson(request)) });
});

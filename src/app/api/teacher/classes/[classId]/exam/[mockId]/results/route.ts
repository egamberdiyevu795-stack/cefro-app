import { classMockResults } from "@/server/exam-laptop/results";
import { json, teacherRoute } from "@/server/teacher/routes";

/** T8: one row per student of this class mock (level, part bands, a link to their mock), and the common problems. Its own teacher only. */
export const GET = teacherRoute("teacher", async (_request, ctx: RouteContext<"/api/teacher/classes/[classId]/exam/[mockId]/results">, userId) => {
  const { classId, mockId } = await ctx.params;
  return json(await classMockResults(userId, classId, mockId));
});

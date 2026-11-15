import { json, readJson, teacherRoute } from "@/server/teacher/routes";
import { rateMock } from "@/server/teacher/teacher-service";

/**
 * The teacher's level for the whole mock (optional): `PUT { agrees: true }` or `{ agrees: false, level }` (Below B1, B1, B2,
 * C1). Part ratings are the attempt rating route. Never read by the scorer, dashboard or History.
 */
export const PUT = teacherRoute("teacher", async (request, ctx: RouteContext<"/api/teacher/classes/[classId]/mocks/[mockId]/rating">, userId) => {
  const { classId, mockId } = await ctx.params;
  return json({ rating: await rateMock(userId, classId, mockId, await readJson(request)) });
});

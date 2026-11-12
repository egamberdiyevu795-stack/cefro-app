import { roster } from "@/server/exam-laptop/exam-store";
import { json, teacherRoute } from "@/server/teacher/routes";

/**
 * T7's list: every student of the class as Not started / In progress (Room 2) / Done, for the laptop named in `?laptop=`.
 * Names and states only: never a PIN, a hash, a result or an email.
 */
export const GET = teacherRoute("teacher", async (request, ctx: RouteContext<"/api/teacher/classes/[classId]/exam/[mockId]/roster">, userId) => {
  const { classId, mockId } = await ctx.params;
  return json(await roster(userId, classId, mockId, new URL(request.url).searchParams.get("laptop") ?? ""));
});

import { json, teacherRoute } from "@/server/teacher/routes";
import { resetJoinCode } from "@/server/teacher/teacher-store";

/** Reset code: a new join code; the old one stops working at once, members stay. → `{ joinCode }`. */
export const POST = teacherRoute("teacher", async (_request, ctx: RouteContext<"/api/teacher/classes/[classId]/code">, userId) => {
  const { classId } = await ctx.params;
  return json({ joinCode: await resetJoinCode(userId, classId) });
});

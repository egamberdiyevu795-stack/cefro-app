import { NO_STORE, teacherRoute } from "@/server/teacher/routes";
import { closeClass } from "@/server/teacher/teacher-store";

/** Close class: every membership ends, each rating becomes an anonymous pair, the class is gone from every list. 204. */
export const POST = teacherRoute("teacher", async (_request, ctx: RouteContext<"/api/teacher/classes/[classId]/close">, userId) => {
  const { classId } = await ctx.params;
  await closeClass(userId, classId);
  return new Response(null, { status: 204, headers: NO_STORE });
});

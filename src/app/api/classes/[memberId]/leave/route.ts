import { NO_STORE, teacherRoute } from "@/server/teacher/routes";
import { leaveClass } from "@/server/teacher/teacher-store";

/** Leave class (the student's own membership): the teacher loses access at once; ratings become anonymous pairs. 204. */
export const POST = teacherRoute("student", async (_request, ctx: RouteContext<"/api/classes/[memberId]/leave">, userId) => {
  const { memberId } = await ctx.params;
  await leaveClass(userId, memberId);
  return new Response(null, { status: 204, headers: NO_STORE });
});

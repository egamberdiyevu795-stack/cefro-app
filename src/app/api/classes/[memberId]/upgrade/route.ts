import { NO_STORE, teacherRoute } from "@/server/teacher/routes";
import { upgradeMembership } from "@/server/teacher/teacher-store";

/** "Share recordings too" (an old membership's one-time card): from now on every part, mock and recording. 204. */
export const POST = teacherRoute("student", async (_request, ctx: RouteContext<"/api/classes/[memberId]/upgrade">, userId) => {
  const { memberId } = await ctx.params;
  await upgradeMembership(userId, memberId);
  return new Response(null, { status: 204, headers: NO_STORE });
});

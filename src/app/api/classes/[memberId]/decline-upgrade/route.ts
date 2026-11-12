import { NO_STORE, teacherRoute } from "@/server/teacher/routes";
import { declineUpgrade } from "@/server/teacher/teacher-store";

/** "Not now" on the one-time card: nothing changes and the card is not shown again. 204. */
export const POST = teacherRoute("student", async (_request, ctx: RouteContext<"/api/classes/[memberId]/decline-upgrade">, userId) => {
  const { memberId } = await ctx.params;
  await declineUpgrade(userId, memberId);
  return new Response(null, { status: 204, headers: NO_STORE });
});

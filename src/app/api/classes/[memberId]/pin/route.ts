import { NO_STORE, readJson, teacherRoute } from "@/server/teacher/routes";
import { setClassPin } from "@/server/teacher/teacher-store";

/**
 * The student sets or changes the 4-digit class PIN for one of their own classes (Account page > My classes), on their own
 * device. `PUT { pin }` → 200 `{ hasPin: true }`: never the PIN or its hash. The teacher can't read or reset it. 404 for
 * anyone else's membership. A new PIN also clears a lock.
 */
export const PUT = teacherRoute("student", async (request, ctx: RouteContext<"/api/classes/[memberId]/pin">, userId) => {
  const { memberId } = await ctx.params;
  const body = await readJson(request);
  await setClassPin(userId, memberId, body.pin);
  return Response.json({ hasPin: true }, { headers: NO_STORE });
});

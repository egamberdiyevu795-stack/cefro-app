import { enterPin } from "@/server/exam-laptop/exam-store";
import { json, readJson, teacherRoute } from "@/server/teacher/routes";

/**
 * A student taps their name and types their PIN on the teacher's laptop. `POST { memberId, pin, laptopId, room }`. Correct:
 * `{ passId, expiresAt, name, plans, finished }`, a one-mock pass for THAT student on THIS laptop. Wrong: 403 `wrong_pin`
 * (counted per laptop; the 5th wrong PIN is 403 `pin_locked` until the teacher unlocks). The PIN and its hash are never
 * returned.
 */
export const POST = teacherRoute("teacher", async (request, ctx: RouteContext<"/api/teacher/classes/[classId]/exam/[mockId]/pin">, userId) => {
  const { classId, mockId } = await ctx.params;
  const body = await readJson(request);
  return json(await enterPin(userId, classId, mockId, { memberId: body.memberId, pin: body.pin, laptopId: body.laptopId, room: body.room }));
});

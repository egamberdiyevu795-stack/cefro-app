import { deviceRoute } from "@/server/exam-laptop/device-route";
import { enterPin } from "@/server/exam-laptop/exam-store";
import { json, readJson } from "@/server/teacher/routes";

/**
 * A student taps their name and types their PIN on the exam laptop. `POST { memberId, pin }`. Correct: `{ passId, expiresAt, name,
 * plans, finished }`, a one-mock pass for THAT student on THIS laptop (the laptop and its room come from the device session). Wrong:
 * 403 `wrong_pin` (counted per laptop; the 5th is 403 `pin_locked` until the teacher unlocks). The PIN and its hash are never returned.
 */
export const POST = deviceRoute(async (request, ctx: RouteContext<"/api/exam-laptop/[mockId]/pin">, device) => {
  const { mockId } = await ctx.params;
  const body = await readJson(request);
  return json(await enterPin(device.teacherId, device.classId, mockId, { memberId: body.memberId, pin: body.pin, laptopId: device.laptopId, room: device.room }));
});

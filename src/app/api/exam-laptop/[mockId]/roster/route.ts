import { deviceRoute } from "@/server/exam-laptop/device-route";
import { roster } from "@/server/exam-laptop/exam-store";
import { json } from "@/server/teacher/routes";

/**
 * T7's list: every student of the class as Not started / In progress (Room 2) / Done, for THIS laptop (from its device session).
 * Names and states only: never a PIN, a hash, a result or an email. Only the exam laptop's own device session gets in.
 */
export const GET = deviceRoute(async (_request, ctx: RouteContext<"/api/exam-laptop/[mockId]/roster">, device) => {
  const { mockId } = await ctx.params;
  return json(await roster(device.teacherId, device.classId, mockId, device.laptopId));
});

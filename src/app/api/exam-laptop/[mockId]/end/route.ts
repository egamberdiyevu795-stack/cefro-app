import { clearDeviceCookieLine } from "@/server/exam-laptop/device-session";
import { deviceRoute } from "@/server/exam-laptop/device-route";
import { endLaptop } from "@/server/exam-laptop/exam-store";
import { signInDeviceTeacher } from "@/server/exam-laptop/teacher-signin";
import { NO_STORE, readJson } from "@/server/teacher/routes";

/**
 * "End exam laptop": needs the teacher's EMAIL and password again (so a student can't wander into the teacher's account). `POST
 * { email, password, close? }` → 204. This laptop's passes end, the device session is removed and the browser gets a normal teacher
 * session back. `close: true` also closes the class mock, which then refuses every new PIN and start (a student already under way
 * on another laptop finishes). Wrong passwords count like failed sign-ins (429 after too many).
 */
export const POST = deviceRoute(async (request, ctx: RouteContext<"/api/exam-laptop/[mockId]/end">, device) => {
  const { mockId } = await ctx.params;
  const body = await readJson(request);
  const cookies = await signInDeviceTeacher(request, device.teacherId, body.email, body.password);
  await endLaptop(device.teacherId, device.classId, mockId, device.laptopId, body.close === true);
  const response = new Response(null, { status: 204, headers: NO_STORE });
  for (const line of [...cookies, clearDeviceCookieLine()]) response.headers.append("set-cookie", line);
  return response;
});

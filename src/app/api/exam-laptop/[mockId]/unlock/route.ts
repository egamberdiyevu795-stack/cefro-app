import { clearDeviceCookieLine } from "@/server/exam-laptop/device-session";
import { deviceRoute } from "@/server/exam-laptop/device-route";
import { endLaptop, unlockStudent } from "@/server/exam-laptop/exam-store";
import { signInDeviceTeacher } from "@/server/exam-laptop/teacher-signin";
import { NO_STORE, readJson } from "@/server/teacher/routes";

/**
 * Unlock a student locked after 5 wrong PINs. `POST { memberId, email, password }` → 204. It asks for the teacher's EMAIL and
 * password (the laptop is a shared screen and unlocking is more PIN tries) and, like End exam laptop, it hands the browser a
 * normal teacher session back: the device session ends and this laptop's passes end. The teacher then starts the exam laptop again.
 */
export const POST = deviceRoute(async (request, ctx: RouteContext<"/api/exam-laptop/[mockId]/unlock">, device) => {
  const { mockId } = await ctx.params;
  const body = await readJson(request);
  const cookies = await signInDeviceTeacher(request, device.teacherId, body.email, body.password);
  await unlockStudent(device.teacherId, device.classId, mockId, typeof body.memberId === "string" ? body.memberId : "");
  await endLaptop(device.teacherId, device.classId, mockId, device.laptopId, false);
  const response = new Response(null, { status: 204, headers: NO_STORE });
  for (const line of [...cookies, clearDeviceCookieLine()]) response.headers.append("set-cookie", line);
  return response;
});

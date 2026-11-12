import { unlockStudent } from "@/server/exam-laptop/exam-store";
import { verifyTeacherPassword } from "@/server/exam-laptop/password";
import { NO_STORE, readJson, teacherRoute } from "@/server/teacher/routes";

/**
 * The teacher unlocks a student locked after 5 wrong PINs (every laptop's count is cleared). `POST { memberId, password }` →
 * 204. It needs the teacher's password like "End exam laptop": unlocking is more PIN tries, and the laptop is a shared screen.
 */
export const POST = teacherRoute("teacher", async (request, ctx: RouteContext<"/api/teacher/classes/[classId]/exam/[mockId]/unlock">, userId) => {
  const { classId, mockId } = await ctx.params;
  const body = await readJson(request);
  await verifyTeacherPassword(request, typeof body.password === "string" ? body.password : "");
  await unlockStudent(userId, classId, mockId, typeof body.memberId === "string" ? body.memberId : "");
  return new Response(null, { status: 204, headers: NO_STORE });
});

import { endLaptop } from "@/server/exam-laptop/exam-store";
import { verifyTeacherPassword } from "@/server/exam-laptop/password";
import { NO_STORE, readJson, teacherRoute } from "@/server/teacher/routes";

/**
 * "End exam laptop": needs the teacher's PASSWORD again (so a student can't wander into the teacher's account). `POST
 * { password, laptopId, close? }` → 204. This laptop's passes end; `close: true` also closes the class mock, which then
 * refuses every new PIN and start (a student already under way finishes). Wrong passwords count like failed sign-ins.
 */
export const POST = teacherRoute("teacher", async (request, ctx: RouteContext<"/api/teacher/classes/[classId]/exam/[mockId]/end">, userId) => {
  const { classId, mockId } = await ctx.params;
  const body = await readJson(request);
  await verifyTeacherPassword(request, typeof body.password === "string" ? body.password : "");
  await endLaptop(userId, classId, mockId, body.laptopId, body.close === true);
  return new Response(null, { status: 204, headers: NO_STORE });
});

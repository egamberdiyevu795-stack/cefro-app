import { studentDetail } from "@/features/teacher/view-model";
import { teacherLinks } from "@/features/teacher/links";
import { NO_STORE, json, teacherRoute } from "@/server/teacher/routes";
import { studentInClass } from "@/server/teacher/teacher-service";
import { removeStudent } from "@/server/teacher/teacher-store";

type Ctx = RouteContext<"/api/teacher/classes/[classId]/students/[memberId]">;

/** One student (T4): shown name, level and skills from shared attempts, shared attempts newest first. */
export const GET = teacherRoute("teacher", async (_request, ctx: Ctx, userId) => {
  const { classId, memberId } = await ctx.params;
  const { student } = await studentInClass(userId, classId, memberId);
  const detail = studentDetail(student);
  return json({ student: { ...detail, rows: detail.rows.map((row) => ({ ...row, href: teacherLinks.attempt(classId, row.id) })) } });
});

/** Remove from class: the membership ends, the teacher's ratings become anonymous pairs. 204. */
export const DELETE = teacherRoute("teacher", async (_request, ctx: Ctx, userId) => {
  const { classId, memberId } = await ctx.params;
  await removeStudent(userId, classId, memberId);
  return new Response(null, { status: 204, headers: NO_STORE });
});

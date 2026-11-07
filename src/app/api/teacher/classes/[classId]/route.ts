import { commonProblems, studentRow } from "@/features/teacher/view-model";
import { json, teacherRoute } from "@/server/teacher/routes";
import { classWithStudents } from "@/server/teacher/teacher-service";

/**
 * Class overview (T3), its own teacher only: `{ class: { id, name, joinCode }, commonProblems, students }`. Each student
 * is their shown name and what their shared attempts give; no email, account name, recording or exam date.
 */
export const GET = teacherRoute("teacher", async (_request, ctx: RouteContext<"/api/teacher/classes/[classId]">, userId) => {
  const { classId } = await ctx.params;
  const { cls, students } = await classWithStudents(userId, classId);
  return json({ class: { id: cls.id, name: cls.name, joinCode: cls.joinCode }, commonProblems: commonProblems(students), students: students.map(studentRow) });
});

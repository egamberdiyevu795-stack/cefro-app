import { json, teacherRoute } from "@/server/teacher/routes";
import { teacherMock } from "@/server/teacher/teacher-service";

/**
 * T6: a student's full mock for their teacher: four parts, each with transcript, the app's band, the teacher's own rating
 * and the recording address when the teacher may hear it. Only when `teacherCanSeeMock` passes through this class;
 * otherwise the same 404 as a stranger's result. No email, no account name.
 */
export const GET = teacherRoute("teacher", async (_request, ctx: RouteContext<"/api/teacher/classes/[classId]/mocks/[mockId]">, userId) => {
  const { classId, mockId } = await ctx.params;
  return json({ mock: await teacherMock(userId, classId, mockId) });
});

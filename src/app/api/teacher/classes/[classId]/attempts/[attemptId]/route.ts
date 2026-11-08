import { json, teacherRoute } from "@/server/teacher/routes";
import { teacherAttempt } from "@/server/teacher/teacher-service";

/**
 * One shared attempt (T5), read-only: transcript, evaluation, retry outcome and the teacher's own rating. Only when
 * `teacherCanSee` passes through this class; otherwise the same 404 as a stranger's result. Never the recording.
 */
export const GET = teacherRoute("teacher", async (_request, ctx: RouteContext<"/api/teacher/classes/[classId]/attempts/[attemptId]">, userId) => {
  const { classId, attemptId } = await ctx.params;
  return json({ attempt: await teacherAttempt(userId, classId, attemptId) });
});

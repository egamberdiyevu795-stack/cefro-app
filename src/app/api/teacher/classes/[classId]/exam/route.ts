import { toClassMockView, openClassMockOf, startClassMock, suggestPaper } from "@/server/exam-laptop/exam-store";
import { json, readJson, teacherRoute } from "@/server/teacher/routes";
import { ownOpenClass } from "@/server/teacher/teacher-store";

/**
 * "Start exam laptop" (T3 > T7). `GET` → `{ open, suggestion }`: the class's open class mock (null when none), and the "same
 * paper" suggestion, one task per part nobody in the class has done. `POST { mode: "same" | "different", tasks? }` opens the
 * class mock, or JOINS the one already open (the second laptop; then `joined: true` and the mode is ignored). Its own
 * teacher only; the same 404 as a stranger's class for anyone else.
 */
export const GET = teacherRoute("teacher", async (_request, ctx: RouteContext<"/api/teacher/classes/[classId]/exam">, userId) => {
  const { classId } = await ctx.params;
  await ownOpenClass(userId, classId);
  const open = await openClassMockOf(classId);
  return json({ open: open ? toClassMockView(open) : null, suggestion: open ? [] : await suggestPaper(userId, classId) });
});

export const POST = teacherRoute("teacher", async (request, ctx: RouteContext<"/api/teacher/classes/[classId]/exam">, userId) => {
  const { classId } = await ctx.params;
  const body = await readJson(request);
  const { classMock, joined } = await startClassMock(userId, classId, { mode: body.mode, tasks: body.tasks });
  return json({ classMock: toClassMockView(classMock), joined }, joined ? 200 : 201);
});

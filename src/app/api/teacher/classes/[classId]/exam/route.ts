import { isLaptopId, normaliseRoomLabel } from "@/domain/teacher/exam-laptop";
import { deviceCookieLine, signDeviceSession } from "@/server/exam-laptop/device-session";
import { toClassMockView, openClassMockOf, startClassMock, suggestPaper } from "@/server/exam-laptop/exam-store";
import { signOutBrowser } from "@/server/exam-laptop/teacher-signin";
import { HttpError } from "@/server/errors";
import { NO_STORE, json, readJson, teacherRoute } from "@/server/teacher/routes";
import { ownOpenClass } from "@/server/teacher/teacher-store";

/**
 * "Start exam laptop" (T3 > T7). `GET` → `{ open, suggestion }`: the class's open class mock (null when none), and the "same
 * paper" suggestion, one task per part nobody in the class has done. `POST { mode: "same" | "different", tasks?, laptopId, room }`
 * opens the class mock, or JOINS the one already open (the second laptop; then `joined: true` and the mode is ignored). On success
 * the teacher's login session on THIS browser is signed out and replaced by an exam-laptop DEVICE session scoped to that one class
 * mock and this laptop (server/exam-laptop/device-session.ts): from then on this browser can only run the exam laptop. Its own
 * teacher only; the same 404 as a stranger's class for anyone else, a device session included.
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
  if (!isLaptopId(body.laptopId)) throw new HttpError(400, "invalid_laptop", "This laptop could not be identified.");
  const room = normaliseRoomLabel(body.room);
  if (!room) throw new HttpError(400, "invalid_room", "Give this laptop a name, like Room 2.");
  const { classMock, joined } = await startClassMock(userId, classId, { mode: body.mode, tasks: body.tasks });
  // The login session on this browser ends, and the device session takes its place.
  const signedOut = await signOutBrowser(request);
  const response = json({ classMock: toClassMockView(classMock), joined }, joined ? 200 : 201);
  response.headers.set("cache-control", NO_STORE["Cache-Control"]);
  for (const line of signedOut) response.headers.append("set-cookie", line);
  response.headers.append("set-cookie", deviceCookieLine(signDeviceSession({ teacherId: userId, classId, classMockId: classMock.id, laptopId: body.laptopId, room })));
  return response;
});

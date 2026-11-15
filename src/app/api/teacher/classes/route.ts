import { classSummary } from "@/features/teacher/view-model";
import { json, readJson, teacherRoute } from "@/server/teacher/routes";
import { classWithStudents } from "@/server/teacher/teacher-service";
import { createClass, listOwnClasses } from "@/server/teacher/teacher-store";

/**
 * The caller's classes (T1, teachers only): `GET` → `{ classes: [{ id, name, students, lastActivity }] }`.
 * `POST { name }` creates one (T2) → `{ class: { id, name, joinCode } }`. 404 for anyone but a teacher, and while the
 * Teacher view is off.
 */
export const GET = teacherRoute("teacher", async (_request, _ctx, userId) => {
  const classes = await Promise.all(
    (await listOwnClasses(userId)).map(async (cls) => classSummary(cls, (await classWithStudents(userId, cls.id)).students)),
  );
  return json({ classes });
});

export const POST = teacherRoute("teacher", async (request, _ctx, userId) => {
  const body = await readJson(request);
  const created = await createClass(userId, body.name);
  return json({ class: { id: created.id, name: created.name, joinCode: created.joinCode } }, 201);
});

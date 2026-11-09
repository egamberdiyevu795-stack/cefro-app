import { UNKNOWN_CODE_MESSAGE } from "@/domain/teacher/rules";
import { HttpError } from "@/server/errors";
import { assertJoinAllowed, countWrongCode, json, readJson, teacherRoute } from "@/server/teacher/routes";
import { listMemberships, shareWithClass } from "@/server/teacher/teacher-store";

/**
 * The student's classes (S3): `GET` → `{ classes: [{ id, className, teacherName, shownName, sharedAt, endedBy }] }`.
 * `POST { code, shownName }` is the "Share with this teacher" tap (S2): the first time anything is stored; only
 * attempts made after it are shared. → 201 `{ memberId }`.
 */
export const GET = teacherRoute("student", async (_request, _ctx, userId) => json({ classes: await listMemberships(userId) }));

export const POST = teacherRoute("student", async (request, _ctx, userId) => {
  assertJoinAllowed(userId);
  const body = await readJson(request);
  const joined = await shareWithClass(userId, body.code, body.shownName);
  if (!joined) {
    countWrongCode(userId);
    throw new HttpError(404, "unknown_code", UNKNOWN_CODE_MESSAGE);
  }
  return json(joined, 201);
});

import { UNKNOWN_CODE_MESSAGE } from "@/domain/teacher/rules";
import { HttpError } from "@/server/errors";
import { assertJoinAllowed, countWrongCode, json, readJson, teacherRoute } from "@/server/teacher/routes";
import { lookUpCode } from "@/server/teacher/teacher-store";

/**
 * Join a class, step 1 (S1 → S2): `POST { code }` → `{ className, teacherName }`. Nothing is stored. A code that
 * matches no open class: 404 "We can't find a class with this code." Wrong codes count: 10 per account per hour.
 */
export const POST = teacherRoute("student", async (request, _ctx, userId) => {
  assertJoinAllowed(userId);
  const body = await readJson(request);
  const invite = await lookUpCode(body.code);
  if (!invite) {
    countWrongCode(userId);
    throw new HttpError(404, "unknown_code", UNKNOWN_CODE_MESSAGE);
  }
  return json(invite);
});

import { TEACHER_TERMS_VERSION } from "@/domain/teacher/rules";
import { HttpError } from "@/server/errors";
import { withErrorHandling } from "@/server/http";
import { getCurrentUserId } from "@/server/identity/current-user";
import { setOwnRole } from "@/server/teacher/teacher-store";

/**
 * The caller's own role. `PUT { "role": "teacher", "acceptedTerms": true }` takes the teacher role (the terms are
 * stored with the account); `PUT { "role": "student" }` gives it back and closes their classes.
 *
 * Always the caller's own account, never an id from the request, and only a registered account (an anonymous browser
 * identity is always a student). The role by itself opens no student's work: a teacher sees an answer only after that
 * student joins their class with its code and shares it, so choosing it needs no approval.
 */
export const PUT = withErrorHandling(async (request: Request) => {
  const body = (await request.json().catch(() => null)) as { role?: unknown; acceptedTerms?: unknown } | null;
  const role = body?.role;
  if (role !== "teacher" && role !== "student") throw new HttpError(400, "invalid_role", "Choose student or teacher.");
  if (role === "teacher" && body?.acceptedTerms !== true) {
    throw new HttpError(400, "terms_required", "Please accept the teacher terms first.");
  }
  await setOwnRole(await getCurrentUserId(), role, role === "teacher" ? TEACHER_TERMS_VERSION : null);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});

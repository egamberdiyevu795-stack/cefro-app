import "server-only";
import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { getAuth } from "@/server/auth/auth";
import { clientIp, countPasswordFailure, passwordFailureBlocked } from "@/server/auth/auth-limits";
import { EXAM_MESSAGES } from "@/domain/teacher/exam-laptop";
import { HttpError } from "@/server/errors";
import { requireAuthenticated } from "@/server/identity/current-user";

/**
 * The signed-in caller's own password, checked by the auth library exactly as "Delete my account" does it: wrong passwords
 * count like failed sign-ins (per email and client address), and too many are a 429. Throws; returns nothing.
 */
export async function verifyTeacherPassword(request: Request, password: string): Promise<void> {
  if (!password) throw new HttpError(400, "password_required", EXAM_MESSAGES.needsPassword);
  const user = await requireAuthenticated();
  const ip = clientIp(request);
  const blocked = passwordFailureBlocked(user.email, ip);
  if (blocked.blocked) throw new HttpError(429, "password_rate_limited", "Too many wrong passwords. Please wait a few minutes and try again.", blocked.retryAfterSeconds);
  try {
    await (await getAuth()).api.verifyPassword({ body: { password }, headers: await headers() });
  } catch (error) {
    if (error instanceof APIError) {
      countPasswordFailure(user.email, ip);
      throw new HttpError(400, "wrong_password", EXAM_MESSAGES.wrongPassword);
    }
    throw error;
  }
}

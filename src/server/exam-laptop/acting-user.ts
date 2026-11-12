import "server-only";
import { HttpError } from "@/server/errors";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";
import { requireAuthenticated } from "@/server/identity/current-user";
import { teacherLive } from "@/server/teacher/release";
import { userRole } from "@/server/teacher/teacher-store";
import { resolvePass, type ResolvedPass } from "./exam-store";

/** The two request headers an exam laptop adds to the few routes the full mock uses. */
export const EXAM_PASS_HEADER = "x-exam-pass";
export const EXAM_LAPTOP_HEADER = "x-exam-laptop";

export interface Acting {
  /** Whose account the request acts as: the caller, or (with a pass) the student the pass is for. */
  userId: string;
  /** Set only for a request made with a one-mock pass. */
  pass: ResolvedPass | null;
}

/**
 * Who a mock or upload request acts as. THE one place a pass is turned into a student, and ONLY the routes that call it
 * accept a pass (the mock's start and finish, and the recording upload): any other route never reads the header, so a
 * pass can't reach the account page, a result, a recording, a password or anything else of the student.
 *
 *   no pass header   the caller, exactly as before.
 *   a pass           the caller must ALSO be signed in as the teacher who owns the pass's class mock, from the laptop the
 *                    pass was made for; the pass must be current (not used up, not expired, student not locked or gone).
 *                    The result acts as that student: a recording made this way is saved to THEIR account and goes
 *                    through THEIR consent check. The teacher's own account is never the owner.
 */
export async function actingUser(request: Request): Promise<Acting> {
  const sent = request.headers;
  const passId = sent.get(EXAM_PASS_HEADER);
  if (!passId) return { userId: await getOrCreateCurrentUserId(), pass: null };
  if (!teacherLive()) throw new HttpError(404, "not_found", "Not found.");
  let teacherId: string;
  try {
    teacherId = (await requireAuthenticated()).userId;
  } catch {
    throw new HttpError(403, "exam_pass_invalid", "This pass is not valid.");
  }
  if ((await userRole(teacherId)) !== "teacher") throw new HttpError(403, "exam_pass_invalid", "This pass is not valid.");
  const pass = await resolvePass(teacherId, passId, sent.get(EXAM_LAPTOP_HEADER));
  return { userId: pass.studentUserId, pass };
}

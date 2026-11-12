import "server-only";
import { headers } from "next/headers";
import { HttpError } from "@/server/errors";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";
import { teacherLive } from "@/server/teacher/release";
import { readDeviceSession } from "./device-session";
import { resolvePass, type ResolvedPass } from "./exam-store";

/** The request header an exam laptop adds to the few routes the full mock uses. (The laptop itself is named by its device session.) */
export const EXAM_PASS_HEADER = "x-exam-pass";

export interface Acting {
  /** Whose account the request acts as: the caller, or (with a pass) the student the pass is for. */
  userId: string;
  /** Set only for a request made with a one-mock pass. */
  pass: ResolvedPass | null;
}

const invalid = () => new HttpError(403, "exam_pass_invalid", "This pass is not valid.");

/**
 * Who a mock or upload request acts as. THE one place a pass is turned into a student, and ONLY the routes that call it
 * accept a pass (the mock's start and finish, and the recording upload): any other route never reads the header, so a
 * pass can't reach the account page, a result, a recording, a password or anything else of the student.
 *
 *   no pass header   the caller, exactly as before.
 *   a pass           the request must ALSO carry the exam laptop's DEVICE SESSION (the browser has no login session: it was
 *                    replaced when the exam laptop started), the pass must belong to that device's class mock and laptop and
 *                    be current (not used up, not expired, student not locked or gone). The result acts as that student: a
 *                    recording made this way is saved to THEIR account and goes through THEIR consent check. A teacher's own
 *                    account is never the owner. A student already under way may finish after the class mock closed.
 */
export async function actingUser(request: Request): Promise<Acting> {
  const passId = request.headers.get(EXAM_PASS_HEADER);
  if (!passId) return { userId: await getOrCreateCurrentUserId(), pass: null };
  if (!teacherLive()) throw new HttpError(404, "not_found", "Not found.");
  const device = await readDeviceSession((await headers()).get("cookie"), { allowClosed: true });
  if (!device) throw invalid();
  const pass = await resolvePass(device.teacherId, passId, device.laptopId);
  if (pass.classMock.id !== device.classMockId) throw new HttpError(403, "exam_pass_other_class_mock", "This pass is for another class mock.");
  return { userId: pass.studentUserId, pass };
}

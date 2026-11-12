import { audioResponse } from "@/server/audio/range-response";
import { getAudioStorage } from "@/server/storage";
import { errorResponse } from "@/server/http";
import { teacherRoute } from "@/server/teacher/routes";
import { teacherCanHear } from "@/server/teacher/teacher-store";

/**
 * A student's recording for their teacher's player (docs/v1-plan.md section 4.4). Only when `teacherCanHear`: the caller is
 * the teacher of an open class the student still shares with, the attempt is inside that membership's scope, the account
 * still has teacher-sharing consent and the audio is not deleted. Anything else is the same 404 as a stranger's recording.
 * Never cached, shown inline only (the player has no download button), and no log of who listened (owner decision).
 */
export const GET = teacherRoute("teacher", async (request, ctx: RouteContext<"/api/teacher/classes/[classId]/attempts/[attemptId]/audio">, userId) => {
  const { classId, attemptId } = await ctx.params;
  const hearable = await teacherCanHear(userId, attemptId);
  if (!hearable || hearable.visible.classId !== classId) return errorResponse(404, "not_found", "Not found.");
  const data = await getAudioStorage().read(hearable.storageKey).catch(() => null);
  if (!data) return errorResponse(404, "not_found", "Not found.");
  const response = audioResponse(data, hearable.mimeType, request.headers.get("range"));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Content-Disposition", "inline");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
});

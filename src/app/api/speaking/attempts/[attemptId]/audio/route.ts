import { audioResponse } from "@/server/audio/range-response";
import { getRecordingAudio } from "@/server/attempts/attempt-service";
import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";

/** Stream the student's own recording back for playback (with Range support, which browsers need for media). */
export const GET = withErrorHandling(
  async (request: Request, ctx: RouteContext<"/api/speaking/attempts/[attemptId]/audio">) => {
    const { attemptId } = await ctx.params;
    const userId = await getOrCreateCurrentUserId();
    const { data, mimeType } = await getRecordingAudio(userId, attemptId);
    return audioResponse(data, mimeType, request.headers.get("range"));
  },
);

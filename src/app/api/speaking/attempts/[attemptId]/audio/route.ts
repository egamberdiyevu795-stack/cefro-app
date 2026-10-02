import { getRecordingAudio } from "@/server/attempts/attempt-service";
import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";

/** Stream the student's own recording back for playback. */
export const GET = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/speaking/attempts/[attemptId]/audio">) => {
    const { attemptId } = await ctx.params;
    const userId = await getOrCreateCurrentUserId();
    const { data, mimeType } = await getRecordingAudio(userId, attemptId);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  },
);

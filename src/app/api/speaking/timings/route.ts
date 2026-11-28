import { findLatestEvaluationsFor, listAttemptsForUser, listUploadTimingsFor } from "@/server/attempts/attempt-repository";
import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";

/**
 * Where the minutes went for the signed-in person's own latest attempts (newest first): the recording's length, the
 * browser's upload time, then the server's waiting, preparation, transcription and evaluation times. Only the caller's
 * own attempts are ever read. Open it in the browser while signed in; it is the data behind "why is scoring slow?".
 */
export const GET = withErrorHandling(async () => {
  const userId = await getOrCreateCurrentUserId();
  const rows = (await listAttemptsForUser(userId)).slice(0, 20);
  const ids = rows.map((r) => r.attempt.id);
  const evaluationByAttempt = await findLatestEvaluationsFor(ids);

  const uploads = await listUploadTimingsFor(userId, ids);

  const attempts = rows.map((r) => {
    const config = (evaluationByAttempt.get(r.attempt.id)?.modelConfig ?? {}) as Record<string, unknown>;
    return {
      attemptId: r.attempt.id,
      task: r.title,
      part: r.part,
      status: r.attempt.status,
      createdAt: r.attempt.createdAt,
      recordingMs: r.recordingDurationMs,
      upload: uploads.get(r.attempt.id) ?? null,
      server: config.timings ?? { processingMs: r.attempt.processingDurationMs },
      evaluationSplit: { textMs: config.textMs ?? null, audioMs: config.audioMs ?? null },
    };
  });
  return Response.json({ attempts }, { headers: { "Cache-Control": "no-store" } });
});

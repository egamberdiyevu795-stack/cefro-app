import { after } from "next/server";
import { z } from "zod";
import { MAX_AUDIO_BYTES, createAttempt } from "@/server/attempts/attempt-service";
import { claimAttempt, runClaimedAttempt } from "@/server/attempts/attempt-processing";
import { HttpError } from "@/server/errors";
import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";

// Processing (transcription + evaluation) continues after the response via `after`.
export const maxDuration = 300;

const fieldsSchema = z.object({
  taskId: z.string().min(1).max(200),
  durationMs: z.coerce.number().int().min(0).max(30 * 60 * 1000),
  previousAttemptId: z.string().uuid().optional(),
});

/**
 * Submit a recording (multipart/form-data: audio, taskId, durationMs,
 * previousAttemptId?). Creates the attempt and starts processing in the
 * background; the client polls GET /api/speaking/attempts/:id for progress.
 */
export const POST = withErrorHandling(async (request: Request) => {
  // Reject oversized uploads before buffering the body (the form adds a little overhead).
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_AUDIO_BYTES + 64 * 1024) {
    throw new HttpError(413, "audio_too_large", "The recording is too large.");
  }
  const userId = await getOrCreateCurrentUserId();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "invalid_form", "The upload was incomplete. Please try again.");
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) throw new HttpError(400, "missing_audio", "No recording was received.");

  const fields = fieldsSchema.safeParse({
    taskId: form.get("taskId"),
    durationMs: form.get("durationMs"),
    previousAttemptId: form.get("previousAttemptId") || undefined,
  });
  if (!fields.success) throw new HttpError(400, "invalid_fields", "The upload was missing information.");

  const attempt = await createAttempt({
    userId,
    taskId: fields.data.taskId,
    audio: Buffer.from(await audio.arrayBuffer()),
    mimeType: audio.type || "audio/webm",
    durationMs: fields.data.durationMs,
    previousAttemptId: fields.data.previousAttemptId ?? null,
  });

  if (claimAttempt(attempt.id)) {
    after(() => runClaimedAttempt(attempt.id));
  }
  return Response.json({ attempt: { ...attempt, status: "processing" } }, { status: 201 });
});

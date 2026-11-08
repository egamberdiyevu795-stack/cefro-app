import { after } from "next/server";
import { z } from "zod";
import { MAX_AUDIO_BYTES, createAttempt } from "@/server/attempts/attempt-service";
import { claimAttempt, runClaimedAttempt } from "@/server/attempts/attempt-processing";
import { getEnv } from "@/server/config/env";
import { validateProviderConfig } from "@/server/config/provider-config";
import { assertCanRecord } from "@/server/consent/consent";
import { HttpError } from "@/server/errors";
import { parseFormData, readBodyWithLimit, withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";

// Processing (transcription + evaluation) continues after the response via `after`.
export const maxDuration = 300;

const fieldsSchema = z.object({
  taskId: z.string().min(1).max(200),
  durationMs: z.coerce.number().int().min(0).max(30 * 60 * 1000),
  previousAttemptId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  clientAttemptId: z.string().uuid().optional(),
});

/** The audio limit plus room for the multipart framing and the small text fields. */
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024;

/**
 * Submit a recording (multipart/form-data: audio, taskId, durationMs,
 * previousAttemptId?). Creates the attempt and starts processing in the
 * background; the client polls GET /api/speaking/attempts/:id for progress.
 */
export const POST = withErrorHandling(async (request: Request) => {
  // Fail before buffering anything when the server cannot evaluate answers (the student keeps the
  // recording in the browser and can send it again once this is fixed).
  if (validateProviderConfig(getEnv()).length > 0) {
    throw new HttpError(
      503,
      "service_not_configured",
      "CEFRO can't check answers right now. Your recording is still here: please try sending it again in a little while.",
      300,
    );
  }
  const userId = await getOrCreateCurrentUserId();
  // Pilot consent (CONSENT_REQUIRED): refused before the recording is read or stored.
  await assertCanRecord(userId);

  // The body is counted as it arrives: Content-Length is only a fast path and may be missing or wrong.
  const body = await readBodyWithLimit(request, MAX_BODY_BYTES);
  const form = await parseFormData(body, request.headers.get("content-type"));

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) throw new HttpError(400, "missing_audio", "No recording was received.");

  const fields = fieldsSchema.safeParse({
    taskId: form.get("taskId"),
    durationMs: form.get("durationMs"),
    previousAttemptId: form.get("previousAttemptId") || undefined,
    sessionId: form.get("sessionId") || undefined,
    clientAttemptId: form.get("clientAttemptId") || undefined,
  });
  if (!fields.success) throw new HttpError(400, "invalid_fields", "The upload was missing information.");

  const attempt = await createAttempt({
    userId,
    taskId: fields.data.taskId,
    audio: Buffer.from(await audio.arrayBuffer()),
    mimeType: audio.type || "audio/webm",
    durationMs: fields.data.durationMs,
    previousAttemptId: fields.data.previousAttemptId ?? null,
    sessionId: fields.data.sessionId ?? null,
    clientAttemptId: fields.data.clientAttemptId ?? null,
  });

  // A resent recording returns the existing attempt; claiming is a no-op unless it never started processing.
  const claimed = await claimAttempt(attempt.id);
  if (claimed) after(() => runClaimedAttempt(attempt.id));
  return Response.json({ attempt: claimed ? { ...attempt, status: "processing" } : attempt }, { status: 201 });
});

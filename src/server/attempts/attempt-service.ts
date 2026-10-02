import "server-only";
import type { EvaluationResult } from "@/domain/evaluation/schema";
import type { AttemptSummary, AttemptView } from "@/domain/speaking/attempt";
import { getSpeakingTask } from "@/content/speaking";
import { trackServerEvent } from "@/server/analytics/track";
import { HttpError } from "@/server/errors";
import { newId } from "@/server/ids";
import { logger } from "@/server/logging/logger";
import { getAudioStorage } from "@/server/storage";
import * as repo from "./attempt-repository";
import { toAttemptSummary, toAttemptView } from "./attempt-views";

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a"];

export interface CreateAttemptInput {
  userId: string;
  taskId: string;
  audio: Buffer;
  mimeType: string;
  durationMs: number;
  previousAttemptId: string | null;
}

/**
 * Store a submitted recording and create its attempt (status "uploaded").
 * Audio is written to storage BEFORE the database row, so an attempt never
 * points at audio that does not exist.
 */
export async function createAttempt(input: CreateAttemptInput): Promise<AttemptView> {
  const task = getSpeakingTask(input.taskId);
  if (!task) throw new HttpError(404, "task_not_found", "This task does not exist.");

  const baseMime = input.mimeType.split(";")[0].trim().toLowerCase();
  if (!ACCEPTED_AUDIO_TYPES.includes(baseMime)) {
    throw new HttpError(415, "unsupported_audio", "This audio format is not supported.");
  }
  if (input.audio.byteLength === 0) {
    throw new HttpError(400, "empty_audio", "The recording is empty.");
  }
  if (input.audio.byteLength > MAX_AUDIO_BYTES) {
    throw new HttpError(413, "audio_too_large", "The recording is too large.");
  }

  // Retry: the previous attempt must be the user's own, for the same task, and evaluated.
  let retryFocus: EvaluationResult["retry_focus"] | null = null;
  if (input.previousAttemptId) {
    const previous = repo.findAttempt(input.previousAttemptId);
    if (!previous || previous.userId !== input.userId || previous.taskId !== task.id) {
      throw new HttpError(400, "invalid_previous_attempt", "The previous attempt could not be found.");
    }
    const previousEvaluation = repo.findLatestEvaluation(previous.id);
    retryFocus = previousEvaluation ? (previousEvaluation.result as EvaluationResult).retry_focus : null;
  }

  const attemptId = newId();
  const storage = getAudioStorage();
  const extension = baseMime.split("/")[1] ?? "bin";
  const storageKey = `speaking/${input.userId}/${attemptId}.${extension}`;

  try {
    await storage.save(storageKey, input.audio, baseMime);
  } catch (error) {
    logger.error("Failed to store recording", { error, attemptId });
    throw new HttpError(503, "storage_failed", "We could not save your recording. Please try again.");
  }

  repo.ensureTaskSnapshot(task);
  const attempt = repo.insertAttemptWithRecording({
    attemptId,
    userId: input.userId,
    task,
    previousAttemptId: input.previousAttemptId,
    retryFocus,
    recording: {
      storageProvider: storage.provider,
      storageKey,
      mimeType: baseMime,
      sizeBytes: input.audio.byteLength,
      durationMs: Math.max(0, Math.round(input.durationMs)),
    },
  });

  trackServerEvent({
    name: "recording_submitted",
    userId: input.userId,
    taskId: task.id,
    attemptId: attempt.id,
    properties: {
      attemptNumber: attempt.attemptNumber,
      durationMs: Math.round(input.durationMs),
      sizeBytes: input.audio.byteLength,
      mimeType: baseMime,
      isRetry: Boolean(input.previousAttemptId),
    },
  });

  return getAttemptViewForUser(input.userId, attempt.id);
}

/** Load an attempt the user owns. Other users' attempts are reported as not found. */
export function getOwnedAttempt(userId: string, attemptId: string): repo.AttemptRow {
  const attempt = repo.findAttempt(attemptId);
  if (!attempt || attempt.userId !== userId) {
    throw new HttpError(404, "attempt_not_found", "This attempt could not be found.");
  }
  return attempt;
}

export function getAttemptViewForUser(userId: string, attemptId: string): AttemptView {
  const attempt = getOwnedAttempt(userId, attemptId);
  return toAttemptView(attempt, {
    recording: repo.findRecording(attempt.id),
    transcript: repo.findLatestTranscript(attempt.id),
    evaluation: repo.findLatestEvaluation(attempt.id),
  });
}

export function listAttemptSummaries(userId: string, taskId: string): AttemptSummary[] {
  const attempts = repo.listAttemptsForUserTask(userId, taskId);
  const evaluationsByAttempt = repo.findLatestEvaluationsFor(attempts.map((a) => a.id));
  return attempts.map((attempt) => toAttemptSummary(attempt, evaluationsByAttempt.get(attempt.id)));
}

export async function getRecordingAudio(
  userId: string,
  attemptId: string,
): Promise<{ data: Buffer; mimeType: string }> {
  getOwnedAttempt(userId, attemptId);
  const recording = repo.findRecording(attemptId);
  if (!recording) throw new HttpError(404, "recording_not_found", "Recording not found.");
  const data = await getAudioStorage().read(recording.storageKey);
  return { data, mimeType: recording.mimeType };
}

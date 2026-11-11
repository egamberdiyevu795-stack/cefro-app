import "server-only";
import { parseStoredEvaluation, type RetryFocusItem } from "@/domain/evaluation/stored";
import type { AttemptSummary, AttemptView } from "@/domain/speaking/attempt";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { getAnySpeakingTask } from "@/content/speaking";
import { fullMockLive } from "@/config/features";
import { isTaskLive as isPartLive } from "@/config/part-live";
import type { AnySpeakingTask } from "@/domain/speaking/any-task";
import { isArgumentTask } from "@/domain/speaking/any-task";
import { validChosenPoints } from "@/domain/speaking/argument-task";
import { validQuestionOffsets } from "@/domain/speaking/metrics";
import { trackServerEvent } from "@/server/analytics/track";
import { HttpError } from "@/server/errors";
import { assertOwnedOrNotFound, ownsResource } from "@/server/identity/authorization";
import { newId } from "@/server/ids";
import { assertCanSubmitAttempt } from "@/server/limits/usage-limits";
import { logger } from "@/server/logging/logger";
import { assertMockAcceptsPart, findOwnedMockSession } from "@/server/sessions/mock-service";
import { createPracticeSession, resolveOwnedSessionId } from "@/server/sessions/session-service";
import { getAudioStorage } from "@/server/storage";
import * as repo from "./attempt-repository";
import { containerForMime, sniffAudioContainer } from "./audio-format";
import { toAttemptSummary, toAttemptView, toHistoryAttempt } from "./attempt-views";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a"];

export interface CreateAttemptInput {
  userId: string;
  taskId: string;
  audio: Buffer;
  mimeType: string;
  durationMs: number;
  previousAttemptId: string | null;
  /** Session id supplied by the client. Used only if it is one of the user's own; otherwise a new one is made. */
  sessionId?: string | null;
  /**
   * Idempotency key chosen by the browser (a UUID, used as the attempt id). Sending the same recording again
   * after a lost response returns the attempt that was already created instead of making a second one.
   */
  clientAttemptId?: string | null;
  /** Part 1 (one recording per part): the start of each question's speaking window, in recording time. */
  questionOffsetsMs?: unknown;
  /** Part 3: the points the student ticked on the preparation screen. Feedback only; the evaluator judges what was said. */
  chosenPoints?: unknown;
}

/**
 * Real attempts only for parts that are live (`PART_LIVE`). Part 1.1, 1.2 and 3 are not yet: their tasks open only in
 * mock mode, which never uploads. Tests pass their own rule.
 */
export type PartLiveRule = (task: AnySpeakingTask) => boolean;
export const isTaskLive: PartLiveRule = isPartLive;

/** The attempt already created for this idempotency key, or undefined. Someone else's id is a conflict. */
async function findResubmittedAttempt(userId: string, clientAttemptId: string | null | undefined) {
  if (!clientAttemptId) return undefined;
  const existing = await repo.findAttempt(clientAttemptId);
  if (existing && !ownsResource(userId, existing)) {
    throw new HttpError(409, "attempt_conflict", "This recording could not be sent. Please record your answer again.");
  }
  return existing;
}

/**
 * Store a submitted recording and create its attempt (status "uploaded").
 * Audio is written to storage BEFORE the database row, so an attempt never
 * points at audio that does not exist.
 */
export async function createAttempt(input: CreateAttemptInput, options: { isLive?: PartLiveRule; fullMockLive?: boolean } = {}): Promise<AttemptView> {
  const task = getAnySpeakingTask(input.taskId);
  if (!task) throw new HttpError(404, "task_not_found", "This task does not exist.");
  // A recording that belongs to one of the caller's full mocks needs the mock to be open (all four parts live), not
  // each part on its own; every other recording needs its own part to be live.
  const mockSession = await findOwnedMockSession(input.userId, input.sessionId);
  const taskLive = (options.isLive ?? isTaskLive)(task);
  if (!taskLive && !(mockSession && (options.fullMockLive ?? fullMockLive()))) throw new HttpError(404, "task_not_found", "This task does not exist.");
  if (input.clientAttemptId && !UUID_PATTERN.test(input.clientAttemptId)) {
    throw new HttpError(400, "invalid_fields", "The upload was missing information.");
  }

  // A resend of a recording that already arrived (the first response was lost): no second attempt, no limit hit.
  const resubmitted = await findResubmittedAttempt(input.userId, input.clientAttemptId);
  if (resubmitted) return getAttemptViewForUser(input.userId, resubmitted.id);

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
  if (sniffAudioContainer(input.audio) !== containerForMime(baseMime)) {
    throw new HttpError(415, "unsupported_audio", "This file doesn't look like a valid recording.");
  }

  // A mock that ended, ran out of its 24 hours, or already has this part takes nothing more.
  if (mockSession) await assertMockAcceptsPart(mockSession, task.id);

  // Cost protection comes before anything is stored or any provider is called.
  await assertCanSubmitAttempt(input.userId);

  // Retry: the previous attempt must be the user's own, for the same task, and evaluated.
  let retryFocus: RetryFocusItem[] | null = null;
  if (input.previousAttemptId) {
    const previous = await repo.findAttempt(input.previousAttemptId);
    if (!previous || !ownsResource(input.userId, previous) || previous.taskId !== task.id) {
      throw new HttpError(400, "invalid_previous_attempt", "The previous attempt could not be found.");
    }
    const previousEvaluation = await repo.findLatestEvaluation(previous.id);
    retryFocus = previousEvaluation
      ? (parseStoredEvaluation(previousEvaluation.schemaVersion, previousEvaluation.result)?.retry_focus ?? null)
      : null;
  }

  // Part 1: offsets that don't fit the task (count, order, length) are dropped; the answer is still scored.
  const questionOffsetsMs = !isArgumentTask(task) && task.delivery
    ? validQuestionOffsets(input.questionOffsetsMs, task.prompts.length, Math.round(input.durationMs))
    : null;
  // Part 3: ticked points that don't fit the task (unknown ids, repeats, more than two per side) are dropped too.
  const chosenPoints = isArgumentTask(task) ? validChosenPoints(input.chosenPoints) : null;

  const attemptId = input.clientAttemptId ?? newId();
  const storage = getAudioStorage();
  // Extension comes from the validated container, never from client input.
  const extension = containerForMime(baseMime) ?? "bin";
  const storageKey = `speaking/${input.userId}/${attemptId}.${extension}`;

  try {
    await storage.save(storageKey, input.audio, baseMime);
  } catch (error) {
    logger.error("Failed to store recording", { error, attemptId });
    throw new HttpError(503, "storage_failed", "We could not save your recording. Please try again.");
  }

  let attempt: repo.AttemptRow;
  let sessionId: string;
  try {
    sessionId = (await resolveOwnedSessionId(input.userId, input.sessionId)) ?? (await createPracticeSession(input.userId));
    await repo.ensureTaskSnapshot(task);
    attempt = await repo.insertAttemptWithRecording({
    attemptId,
    userId: input.userId,
    sessionId,
    task,
    previousAttemptId: input.previousAttemptId,
    retryFocus,
    questionOffsetsMs,
    chosenPoints,
    recording: {
      storageProvider: storage.provider,
      storageKey,
      mimeType: baseMime,
      sizeBytes: input.audio.byteLength,
      durationMs: Math.max(0, Math.round(input.durationMs)),
    },
  });
  } catch (error) {
    // Two sends of the same recording raced and the other one created the attempt: its audio is this key, keep it.
    const raced = await findResubmittedAttempt(input.userId, input.clientAttemptId).catch(() => undefined);
    if (raced) return getAttemptViewForUser(input.userId, raced.id);
    // The attempt row was not created, so the stored bytes would be orphaned: remove them (best effort).
    await storage.delete?.(storageKey).catch((cleanupError) => logger.warn("Could not remove an orphaned recording", { error: cleanupError, attemptId }));
    throw error;
  }

  await trackServerEvent({
    name: "recording_submitted",
    userId: input.userId,
    sessionId,
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
export async function getOwnedAttempt(userId: string, attemptId: string): Promise<repo.AttemptRow> {
  // Only a genuinely missing (or foreign) row is a 404; a database failure propagates and is reported as one.
  const attempt = UUID_PATTERN.test(attemptId) ? await repo.findAttempt(attemptId) : undefined;
  return assertOwnedOrNotFound(userId, attempt, () => new HttpError(404, "attempt_not_found", "This attempt could not be found."));
}

export async function getAttemptViewForUser(userId: string, attemptId: string): Promise<AttemptView> {
  const attempt = await getOwnedAttempt(userId, attemptId);
  const [recording, transcript, evaluation] = await Promise.all([
    repo.findRecording(attempt.id),
    repo.findLatestTranscript(attempt.id),
    repo.findLatestEvaluation(attempt.id),
  ]);
  return toAttemptView(attempt, { recording, transcript, evaluation });
}

export async function listAttemptSummaries(userId: string, taskId: string): Promise<AttemptSummary[]> {
  const attempts = await repo.listAttemptsForUserTask(userId, taskId);
  const evaluationsByAttempt = await repo.findLatestEvaluationsFor(attempts.map((a) => a.id));
  return attempts.map((attempt) => toAttemptSummary(attempt, evaluationsByAttempt.get(attempt.id)));
}

/**
 * The History page's list: every attempt the user owns, newest first. The same owner rule as the result page: only
 * rows recorded under the caller's canonical user id are read, so no one else's attempt can ever appear.
 */
export async function listAttemptHistory(userId: string): Promise<HistoryAttempt[]> {
  const rows = await repo.listAttemptsForUser(userId);
  const evaluationsByAttempt = await repo.findLatestEvaluationsFor(rows.map((row) => row.attempt.id));
  return rows.map((row) => toHistoryAttempt(row, evaluationsByAttempt.get(row.attempt.id)));
}

export async function getRecordingAudio(
  userId: string,
  attemptId: string,
): Promise<{ data: Buffer; mimeType: string }> {
  await getOwnedAttempt(userId, attemptId);
  const recording = await repo.findRecording(attemptId);
  if (!recording) throw new HttpError(404, "recording_not_found", "Recording not found.");
  const data = await getAudioStorage().read(recording.storageKey);
  return { data, mimeType: recording.mimeType };
}

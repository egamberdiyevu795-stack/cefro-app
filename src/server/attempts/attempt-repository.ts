import "server-only";
import { and, count, desc, eq, gte, inArray, lt, max, or, sql } from "drizzle-orm";
import type { RetryFocusItem } from "@/domain/evaluation/stored";
import type { AttemptStatus, FailureCode, ProcessingStage } from "@/domain/speaking/attempt";
import type { AnySpeakingTask } from "@/domain/speaking/any-task";
import type { PointId } from "@/domain/speaking/argument-task";
import type { SpeechMetrics } from "@/domain/speaking/metrics";
import { getDb } from "@/server/db/client";
import { evaluations, recordings, speakingAttempts, speakingTasks, transcripts } from "@/server/db/schema";
import { newId, nowIso } from "@/server/ids";

/**
 * Data access for speaking attempts and their related rows.
 * Contains no business rules — those live in attempt-service / processing.
 */

export type AttemptRow = typeof speakingAttempts.$inferSelect;
export type RecordingRow = typeof recordings.$inferSelect;
export type TranscriptRow = typeof transcripts.$inferSelect;
export type EvaluationRow = typeof evaluations.$inferSelect;

export async function ensureTaskSnapshot(task: AnySpeakingTask): Promise<void> {
  const db = await getDb();
  await db
    .insert(speakingTasks)
    .values({
      id: task.id,
      version: task.version,
      level: task.level,
      part: task.part,
      title: task.title,
      content: task,
    })
    .onConflictDoNothing()
    .run();
}

export async function insertAttemptWithRecording(input: {
  attemptId: string;
  userId: string;
  /** The practice session this response belongs to (null only in tests of legacy rows). */
  sessionId: string | null;
  task: AnySpeakingTask;
  previousAttemptId: string | null;
  retryFocus: RetryFocusItem[] | null;
  /** Part 1: where each question's speaking window starts in the recording (kept in `metrics` until transcription). */
  questionOffsetsMs?: number[] | null;
  /** Part 3: the points the student ticked (kept in `metrics` the same way; feedback only). */
  chosenPoints?: PointId[] | null;
  recording: {
    storageProvider: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    durationMs: number;
  };
}): Promise<AttemptRow> {
  const db = await getDb();
  // Everything inside a transaction uses `tx` only, and nothing slow (no provider call) happens inside one: the
  // transaction is a write transaction (BEGIN IMMEDIATE), so concurrent submissions get distinct attempt numbers.
  return db.transaction(async (tx) => {
    const current = await tx
      .select({ value: max(speakingAttempts.attemptNumber) })
      .from(speakingAttempts)
      .where(and(eq(speakingAttempts.userId, input.userId), eq(speakingAttempts.taskId, input.task.id)))
      .get();
    const now = nowIso();
    const attempt = await tx
      .insert(speakingAttempts)
      .values({
        id: input.attemptId,
        userId: input.userId,
        sessionId: input.sessionId,
        taskId: input.task.id,
        taskVersion: input.task.version,
        attemptNumber: (current?.value ?? 0) + 1,
        previousAttemptId: input.previousAttemptId,
        retryFocus: input.retryFocus,
        // No migration: the offsets (and Part 3's ticked points) wait in the metrics column, and transcription adds
        // the speech metrics to them.
        ...(input.questionOffsetsMs || input.chosenPoints?.length
          ? {
              metrics: {
                ...(input.questionOffsetsMs ? { questionOffsetsMs: input.questionOffsetsMs } : {}),
                ...(input.chosenPoints?.length ? { chosenPoints: input.chosenPoints } : {}),
              },
            }
          : {}),
        status: "uploaded",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    await tx
      .insert(recordings)
      .values({ id: newId(), attemptId: attempt.id, ...input.recording, createdAt: now })
      .run();
    return attempt;
  });
}

export async function findAttempt(attemptId: string): Promise<AttemptRow | undefined> {
  const db = await getDb();
  return db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attemptId)).get();
}

export async function listAttemptsForUserTask(userId: string, taskId: string): Promise<AttemptRow[]> {
  const db = await getDb();
  return db
    .select()
    .from(speakingAttempts)
    .where(and(eq(speakingAttempts.userId, userId), eq(speakingAttempts.taskId, taskId)))
    .orderBy(desc(speakingAttempts.attemptNumber))
    .all();
}

/**
 * Every attempt of one user, newest first, with its task snapshot's title, part and level and its recording length.
 * Only rows whose `userId` is the caller's are ever read: this is the History page's owner check.
 */
export async function listAttemptsForUser(userId: string) {
  const db = await getDb();
  return db
    .select({
      attempt: speakingAttempts,
      title: speakingTasks.title,
      part: speakingTasks.part,
      level: speakingTasks.level,
      recordingDurationMs: recordings.durationMs,
    })
    .from(speakingAttempts)
    .innerJoin(speakingTasks, and(eq(speakingTasks.id, speakingAttempts.taskId), eq(speakingTasks.version, speakingAttempts.taskVersion)))
    .leftJoin(recordings, eq(recordings.attemptId, speakingAttempts.id))
    .where(eq(speakingAttempts.userId, userId))
    .orderBy(desc(speakingAttempts.createdAt), desc(speakingAttempts.id))
    .all();
}

export async function findRecording(attemptId: string): Promise<RecordingRow | undefined> {
  const db = await getDb();
  return db.select().from(recordings).where(eq(recordings.attemptId, attemptId)).get();
}

export async function findLatestTranscript(attemptId: string): Promise<TranscriptRow | undefined> {
  const db = await getDb();
  return db
    .select()
    .from(transcripts)
    .where(eq(transcripts.attemptId, attemptId))
    .orderBy(desc(transcripts.createdAt))
    .get();
}

export async function findLatestEvaluation(attemptId: string): Promise<EvaluationRow | undefined> {
  const db = await getDb();
  return db
    .select()
    .from(evaluations)
    .where(eq(evaluations.attemptId, attemptId))
    .orderBy(desc(evaluations.createdAt))
    .get();
}

/** Latest evaluation per attempt, for list views. */
export async function findLatestEvaluationsFor(attemptIds: string[]): Promise<Map<string, EvaluationRow>> {
  const map = new Map<string, EvaluationRow>();
  if (attemptIds.length === 0) return map;
  const db = await getDb();
  const rows = await db
    .select()
    .from(evaluations)
    .where(inArray(evaluations.attemptId, attemptIds))
    .orderBy(evaluations.createdAt)
    .all();
  for (const row of rows) map.set(row.attemptId, row); // later rows overwrite earlier ones
  return map;
}

/**
 * Atomically claim an attempt for processing. Returns false if it is
 * already being processed (and not stale), already completed, or out of
 * processing runs — this is what prevents two concurrent pipelines for the
 * same attempt and unbounded restarts.
 */
export async function claimAttemptForProcessing(attemptId: string, staleBefore: string, maxProcessingRuns: number): Promise<boolean> {
  const now = nowIso();
  const db = await getDb();
  const result = await db
    .update(speakingAttempts)
    .set({
      status: "processing",
      failureStage: null,
      failureCode: null,
      processingStartedAt: now,
      processingRuns: sql`${speakingAttempts.processingRuns} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(speakingAttempts.id, attemptId),
        // Every run (first, manual restart, stalled re-claim) spends provider money: cap them.
        lt(speakingAttempts.processingRuns, maxProcessingRuns),
        or(
          inArray(speakingAttempts.status, ["uploaded", "failed"]),
          and(
            inArray(speakingAttempts.status, ["processing", "transcribing", "evaluating"]),
            lt(speakingAttempts.processingStartedAt, staleBefore),
          ),
        ),
      ),
    )
    .run();
  return result.rowsAffected === 1;
}

/**
 * Saves the answer to "Was this feedback helpful?" only if the attempt has none yet (the first answer is kept, so a
 * second tap, a second tab or a replayed request changes nothing). Returns the answer now stored.
 */
export async function saveFeedbackHelpfulOnce(attemptId: string, helpful: boolean): Promise<boolean | null> {
  const db = await getDb();
  const at = nowIso();
  await db
    .update(speakingAttempts)
    .set({ feedbackHelpful: helpful, feedbackHelpfulAt: at, updatedAt: at })
    .where(and(eq(speakingAttempts.id, attemptId), sql`${speakingAttempts.feedbackHelpful} IS NULL`))
    .run();
  const row = await db.select({ helpful: speakingAttempts.feedbackHelpful }).from(speakingAttempts).where(eq(speakingAttempts.id, attemptId)).get();
  return row?.helpful ?? null;
}

export async function setAttemptStatus(attemptId: string, status: AttemptStatus): Promise<void> {
  const db = await getDb();
  await db
    .update(speakingAttempts)
    .set({ status, updatedAt: nowIso() })
    .where(eq(speakingAttempts.id, attemptId))
    .run();
}

export async function markAttemptFailed(
  attemptId: string,
  stage: ProcessingStage | null,
  code: FailureCode,
  processingDurationMs: number,
): Promise<void> {
  const db = await getDb();
  await db
    .update(speakingAttempts)
    .set({ status: "failed", failureStage: stage, failureCode: code, processingDurationMs, updatedAt: nowIso() })
    .where(eq(speakingAttempts.id, attemptId))
    .run();
}

export async function saveTranscript(input: {
  attemptId: string;
  provider: string;
  model: string;
  text: string;
  language: string | null;
  latencyMs: number;
  metrics: SpeechMetrics;
}): Promise<TranscriptRow> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const row = await tx
      .insert(transcripts)
      .values({
        id: newId(),
        attemptId: input.attemptId,
        provider: input.provider,
        model: input.model,
        text: input.text,
        language: input.language,
        latencyMs: input.latencyMs,
        createdAt: nowIso(),
      })
      .returning()
      .get();
    await tx
      .update(speakingAttempts)
      .set({ metrics: input.metrics, updatedAt: nowIso() })
      .where(eq(speakingAttempts.id, input.attemptId))
      .run();
    return row;
  });
}

export async function saveEvaluationAndComplete(
  input: Omit<typeof evaluations.$inferInsert, "id" | "createdAt">,
  processingDurationMs: number,
): Promise<EvaluationRow> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = nowIso();
    const row = await tx
      .insert(evaluations)
      .values({ ...input, id: newId(), createdAt: now })
      .returning()
      .get();
    await tx
      .update(speakingAttempts)
      .set({ status: "completed", completedAt: now, processingDurationMs, updatedAt: now })
      .where(eq(speakingAttempts.id, input.attemptId))
      .run();
    return row;
  });
}

/** Attempts created since `sinceIso`, for one user or (userId null) for everyone. Used by the usage limits. */
export async function countAttemptsSince(userId: string | null, sinceIso: string): Promise<number> {
  const where = userId
    ? and(eq(speakingAttempts.userId, userId), gte(speakingAttempts.createdAt, sinceIso))
    : gte(speakingAttempts.createdAt, sinceIso);
  const db = await getDb();
  return (await db.select({ value: count() }).from(speakingAttempts).where(where).get())?.value ?? 0;
}

/** The user's attempts that are being processed right now (stalled ones no longer count). */
export async function countInProgressAttempts(userId: string, processingStaleBefore: string, uploadStaleBefore: string): Promise<number> {
  const db = await getDb();
  return (
    (await db
      .select({ value: count() })
      .from(speakingAttempts)
      .where(
        and(
          eq(speakingAttempts.userId, userId),
          or(
            and(
              inArray(speakingAttempts.status, ["processing", "transcribing", "evaluating"]),
              gte(speakingAttempts.processingStartedAt, processingStaleBefore),
            ),
            and(eq(speakingAttempts.status, "uploaded"), gte(speakingAttempts.createdAt, uploadStaleBefore)),
          ),
        ),
      )
      .get())?.value ?? 0
  );
}

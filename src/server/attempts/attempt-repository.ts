import "server-only";
import { and, desc, eq, inArray, lt, max, or, sql } from "drizzle-orm";
import type { RetryFocusItem } from "@/domain/evaluation/schema";
import type { AttemptStatus, FailureCode, ProcessingStage } from "@/domain/speaking/attempt";
import type { SpeechMetrics } from "@/domain/speaking/metrics";
import type { SpeakingTask } from "@/domain/speaking/task";
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

export function ensureTaskSnapshot(task: SpeakingTask): void {
  getDb()
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

export function insertAttemptWithRecording(input: {
  attemptId: string;
  userId: string;
  task: SpeakingTask;
  previousAttemptId: string | null;
  retryFocus: RetryFocusItem[] | null;
  recording: {
    storageProvider: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    durationMs: number;
  };
}): AttemptRow {
  const db = getDb();
  return db.transaction((tx) => {
    const current = tx
      .select({ value: max(speakingAttempts.attemptNumber) })
      .from(speakingAttempts)
      .where(and(eq(speakingAttempts.userId, input.userId), eq(speakingAttempts.taskId, input.task.id)))
      .get();
    const now = nowIso();
    const attempt = tx
      .insert(speakingAttempts)
      .values({
        id: input.attemptId,
        userId: input.userId,
        taskId: input.task.id,
        taskVersion: input.task.version,
        attemptNumber: (current?.value ?? 0) + 1,
        previousAttemptId: input.previousAttemptId,
        retryFocus: input.retryFocus,
        status: "uploaded",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    tx.insert(recordings)
      .values({ id: newId(), attemptId: attempt.id, ...input.recording, createdAt: now })
      .run();
    return attempt;
  });
}

export function findAttempt(attemptId: string): AttemptRow | undefined {
  return getDb().select().from(speakingAttempts).where(eq(speakingAttempts.id, attemptId)).get();
}

export function listAttemptsForUserTask(userId: string, taskId: string): AttemptRow[] {
  return getDb()
    .select()
    .from(speakingAttempts)
    .where(and(eq(speakingAttempts.userId, userId), eq(speakingAttempts.taskId, taskId)))
    .orderBy(desc(speakingAttempts.attemptNumber))
    .all();
}

export function findRecording(attemptId: string): RecordingRow | undefined {
  return getDb().select().from(recordings).where(eq(recordings.attemptId, attemptId)).get();
}

export function findLatestTranscript(attemptId: string): TranscriptRow | undefined {
  return getDb()
    .select()
    .from(transcripts)
    .where(eq(transcripts.attemptId, attemptId))
    .orderBy(desc(transcripts.createdAt))
    .get();
}

export function findLatestEvaluation(attemptId: string): EvaluationRow | undefined {
  return getDb()
    .select()
    .from(evaluations)
    .where(eq(evaluations.attemptId, attemptId))
    .orderBy(desc(evaluations.createdAt))
    .get();
}

/** Latest evaluation per attempt, for list views. */
export function findLatestEvaluationsFor(attemptIds: string[]): Map<string, EvaluationRow> {
  const map = new Map<string, EvaluationRow>();
  if (attemptIds.length === 0) return map;
  const rows = getDb()
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
 * already being processed (and not stale) or already completed — this is
 * what prevents two concurrent pipelines for the same attempt.
 */
export function claimAttemptForProcessing(attemptId: string, staleBefore: string): boolean {
  const now = nowIso();
  const result = getDb()
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
  return result.changes === 1;
}

export function setAttemptStatus(attemptId: string, status: AttemptStatus): void {
  getDb()
    .update(speakingAttempts)
    .set({ status, updatedAt: nowIso() })
    .where(eq(speakingAttempts.id, attemptId))
    .run();
}

export function markAttemptFailed(
  attemptId: string,
  stage: ProcessingStage | null,
  code: FailureCode,
  processingDurationMs: number,
): void {
  getDb()
    .update(speakingAttempts)
    .set({ status: "failed", failureStage: stage, failureCode: code, processingDurationMs, updatedAt: nowIso() })
    .where(eq(speakingAttempts.id, attemptId))
    .run();
}

export function saveTranscript(input: {
  attemptId: string;
  provider: string;
  model: string;
  text: string;
  language: string | null;
  latencyMs: number;
  metrics: SpeechMetrics;
}): TranscriptRow {
  const db = getDb();
  return db.transaction((tx) => {
    const row = tx
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
    tx.update(speakingAttempts)
      .set({ metrics: input.metrics, updatedAt: nowIso() })
      .where(eq(speakingAttempts.id, input.attemptId))
      .run();
    return row;
  });
}

export function saveEvaluationAndComplete(
  input: Omit<typeof evaluations.$inferInsert, "id" | "createdAt">,
  processingDurationMs: number,
): EvaluationRow {
  const db = getDb();
  return db.transaction((tx) => {
    const now = nowIso();
    const row = tx
      .insert(evaluations)
      .values({ ...input, id: newId(), createdAt: now })
      .returning()
      .get();
    tx.update(speakingAttempts)
      .set({ status: "completed", completedAt: now, processingDurationMs, updatedAt: now })
      .where(eq(speakingAttempts.id, input.attemptId))
      .run();
    return row;
  });
}

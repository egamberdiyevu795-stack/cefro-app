import "server-only";
import { parseStoredEvaluation, type RetryFocusItem } from "@/domain/evaluation/stored";
import { isArgumentTask } from "@/domain/speaking/any-task";
import { validChosenPoints } from "@/domain/speaking/argument-task";
import type { FailureCode, ProcessingStage } from "@/domain/speaking/attempt";
import { computeSpeechMetrics, withQuestionTimes, type SpeechMetrics } from "@/domain/speaking/metrics";
import { getAnySpeakingTask } from "@/content/speaking";
import { getEnv } from "@/server/config/env";
import { trackServerEvent } from "@/server/analytics/track";
import { ProviderError } from "@/server/errors";
import { evaluateArgument, evaluateSpeaking, getArgumentEvaluationModel, getAudioAssessor, getEvaluationModel } from "@/server/evaluation";
import type { ArgumentEvaluation } from "@/server/evaluation/argument-evaluator";
import type { SpeakingEvaluation } from "@/server/evaluation/speaking-evaluator";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { getArgumentRubric } from "@/server/evaluation/rubrics/q8";
import { logger } from "@/server/logging/logger";
import { AudioNotFoundError, getAudioStorage } from "@/server/storage";
import { getSpeechGuard } from "@/server/audio/speech-guard";
import { getTranscriptionProvider } from "@/server/transcription";
import * as repo from "./attempt-repository";
import { withDeadline } from "./deadline";
import { PROCESSING_STALE_AFTER_MS } from "./attempt-views";

/** Fewer recognised words than this means there is nothing meaningful to assess. */
const MIN_TRANSCRIPT_WORDS = 5;

/**
 * Fewer recognised words than this = "not enough speech". Part 1.1 has no word floor (docs/part1-plan.md §2,
 * decision 12): "Football. / Plov. / Mother." is a ratable answer, so one word is enough to reach the evaluator.
 */
export function minTranscriptWords(task: { taskType: string }): number {
  return task.taskType === "short_answers" ? 1 : MIN_TRANSCRIPT_WORDS;
}

/** Stored metrics before transcription hold only a Part 1 upload's question offsets. */
function isComputedMetrics(value: unknown): value is SpeechMetrics {
  return typeof value === "object" && value !== null && typeof (value as SpeechMetrics).wordCount === "number";
}

function storedOffsets(value: unknown): number[] | null {
  const offsets = (value as { questionOffsetsMs?: unknown } | null)?.questionOffsetsMs;
  return Array.isArray(offsets) && offsets.every((n) => typeof n === "number") ? offsets : null;
}

/** Part 3: the ticked points waiting in the attempt's metrics (as the offsets do), revalidated on the way out. */
function storedChosenPoints(value: unknown) {
  return validChosenPoints((value as { chosenPoints?: unknown } | null)?.chosenPoints);
}

/**
 * Atomically mark an attempt as "processing". Returns false when it is
 * already being processed (and not stalled) or already completed, which is
 * what prevents two concurrent pipelines for the same attempt.
 */
export async function claimAttempt(attemptId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_AFTER_MS).toISOString();
  const claimed = await repo.claimAttemptForProcessing(attemptId, staleBefore, getEnv().LIMIT_PROCESSING_RUNS_PER_ATTEMPT);
  if (!claimed) logger.info("Attempt not claimable; skipping processing", { attemptId });
  return claimed;
}

/** Claim and process in one call (used by tests and scripts). */
export async function processAttempt(attemptId: string): Promise<void> {
  if (await claimAttempt(attemptId)) await runClaimedAttempt(attemptId);
}

/**
 * Process a claimed attempt: transcription → evaluation → completed.
 *
 * A transcript saved by an earlier (failed) run is reused instead of
 * transcribing again, so retrying after an evaluation failure is cheap.
 * Never throws — failures are stored on the attempt.
 */
export async function runClaimedAttempt(attemptId: string, options: { budgetMs?: number } = {}): Promise<void> {
  const attempt = await repo.findAttempt(attemptId);
  if (!attempt) return;
  const context = { userId: attempt.userId, sessionId: attempt.sessionId, taskId: attempt.taskId, attemptId };
  let stage: ProcessingStage = "transcription";
  const runStartedAt = Date.now();
  // The whole run (transcription + evaluation, including a regeneration) must end inside this budget,
  // which is below the route's maxDuration and the stalled threshold (see attempt-views.ts).
  const deadlineAt = runStartedAt + (options.budgetMs ?? getEnv().PROCESSING_BUDGET_MS);
  let stageStartedAt = runStartedAt;
  let transcriptionMs: number | null = null;

  try {
    const task = getAnySpeakingTask(attempt.taskId);
    if (!task) throw new Error(`Task ${attempt.taskId} no longer exists`);
    const recording = await repo.findRecording(attemptId);
    if (!recording) throw new ProviderError("audio_unavailable", "Recording row missing", { retryable: false });

    // ── Transcription ───────────────────────────────────────────────
    let transcript = await repo.findLatestTranscript(attemptId);
    const offsets = storedOffsets(attempt.metrics);
    let metrics = isComputedMetrics(attempt.metrics) ? attempt.metrics : null;
    if (!transcript || !metrics) {
      await repo.setAttemptStatus(attemptId, "transcribing");
      const provider = getTranscriptionProvider();
      await trackServerEvent({ name: "transcription_started", ...context, properties: { provider: provider.name } });

      const audio = await readAudio(recording.storageKey);

      // Speech Activity Guard: decided from the audio signal, before any provider is called, because transcription
      // models can invent an answer for silence. Blocked recordings stop here with the existing "not enough speech" failure.
      const guard = getSpeechGuard();
      if (guard) {
        const activity = await guard.check({ audio, mimeType: recording.mimeType });
        logger.info("Speech activity checked", {
          ...context,
          hasSpeech: activity.hasSpeech,
          reason: activity.reason,
          activeSeconds: Math.round(activity.activeSeconds * 10) / 10,
          decodeMs: activity.decodeMs,
          analyseMs: activity.analyseMs,
        });
        if (!activity.hasSpeech) {
          await trackServerEvent({
            name: "speech_guard_blocked",
            ...context,
            properties: {
              reason: activity.reason,
              audioSeconds: Math.round(activity.durationSeconds * 10) / 10,
              activeSeconds: Math.round(activity.activeSeconds * 10) / 10,
              provider: provider.name,
            },
          });
          throw new ProviderError("transcription_empty", `No speech detected in the recording (${activity.reason})`, { retryable: false });
        }
      }
      stageStartedAt = Date.now();
      const output = await withDeadline(
        provider.transcribe({ audio, mimeType: recording.mimeType, language: "en" }),
        deadlineAt,
        "transcription",
      );
      const latencyMs = Date.now() - stageStartedAt;
      transcriptionMs = latencyMs;

      // Part 1: the time used per question comes from the offsets the browser sent (one recording per part).
      metrics = withQuestionTimes(computeSpeechMetrics(output.text, recording.durationMs, task.speakingSeconds), offsets, recording.durationMs);
      // Part 3: the ticked points waited in the metrics column; keep them with the computed metrics (feedback only).
      const chosenPoints = storedChosenPoints(attempt.metrics);
      if (chosenPoints?.length) metrics = { ...metrics, chosenPoints };
      if (metrics.wordCount < minTranscriptWords(task)) {
        throw new ProviderError("transcription_empty", `Only ${metrics.wordCount} words recognised`, {
          retryable: false,
        });
      }
      transcript = await repo.saveTranscript({
        attemptId,
        provider: output.provider ?? provider.name,
        model: output.model ?? provider.model,
        text: output.text,
        language: output.language,
        latencyMs,
        metrics,
      });
      await trackServerEvent({
        name: "transcription_completed",
        ...context,
        properties: { provider: output.provider ?? provider.name, model: output.model ?? provider.model, latencyMs, wordCount: metrics.wordCount },
      });
    }

    // ── Evaluation ──────────────────────────────────────────────────
    stage = "evaluation";
    stageStartedAt = Date.now();
    await repo.setAttemptStatus(attemptId, "evaluating");
    const audioRef = {
      storageProvider: recording.storageProvider,
      storageKey: recording.storageKey,
      mimeType: recording.mimeType,
      durationMs: recording.durationMs,
    };
    const previousAttempt = await loadPreviousAttemptContext(attempt);

    let evaluation: SpeakingEvaluation | ArgumentEvaluation;
    let requestedModel: string;
    if (isArgumentTask(task)) {
      // Part 3 (official Question 8): the same pipeline shape, with the Part 3 evaluator and rubric. No audio step
      // yet: pronunciation is not assessed and the result is provisional (docs/part3-plan.md, section 7).
      const model = getArgumentEvaluationModel();
      requestedModel = model.model;
      await trackServerEvent({ name: "evaluation_started", ...context, properties: { provider: model.provider, model: model.model } });
      evaluation = await withDeadline(
        evaluateArgument(
          {
            task,
            rubric: getArgumentRubric(task),
            transcript: transcript.text,
            metrics,
            chosenPoints: storedChosenPoints(metrics) ?? [],
            audio: audioRef,
            previousAttempt,
          },
          model,
        ),
        deadlineAt,
        "evaluation",
      );
    } else {
      const model = getEvaluationModel();
      requestedModel = model.model;
      const audioAssessor = getAudioAssessor();
      await trackServerEvent({ name: "evaluation_started", ...context, properties: { provider: model.provider, model: model.model } });

      const evaluationInput = {
        task,
        rubric: getSpeakingRubric(task),
        transcript: transcript.text,
        metrics,
        audio: audioRef,
        previousAttempt,
      };
      // The audio step needs the recording; when it cannot be read, pronunciation is simply not assessed.
      const recordingAudio = audioAssessor ? await readAudio(recording.storageKey).catch(() => null) : null;
      evaluation = await withDeadline(
        evaluateSpeaking(evaluationInput, model, { deadlineAt, audioAssessor, audio: recordingAudio }),
        deadlineAt,
        "evaluation",
      );
    }

    const processingDurationMs = Date.now() - runStartedAt;
    const qualityWarnings = evaluation.quality.violations.map((v) => v.code);
    await repo.saveEvaluationAndComplete({
      attemptId,
      transcriptId: transcript.id,
      evaluatorVersion: evaluation.evaluatorVersion,
      rubricVersion: evaluation.rubricVersion,
      schemaVersion: evaluation.schemaVersion,
      promptHash: evaluation.promptHash,
      provider: evaluation.provider,
      model: evaluation.model,
      modelConfig: { requestedModel, ...evaluation.modelConfig },
      modelCalls: evaluation.modelCalls,
      qualityReport: {
        warnings: evaluation.quality.violations,
        rejectedDrafts: evaluation.quality.rejectedDrafts,
      },
      overallLevel: bandHeadline(evaluation.result.scoring.band),
      result: evaluation.result,
      latencyMs: evaluation.latencyMs,
      inputTokens: evaluation.inputTokens,
      outputTokens: evaluation.outputTokens,
    }, processingDurationMs);

    // One structured line per processed attempt: the basis for cost/latency analysis.
    logger.info("Attempt processed", {
      ...context,
      transcriptionMs,
      evaluationMs: evaluation.latencyMs,
      processingDurationMs,
      modelCalls: evaluation.modelCalls,
      inputTokens: evaluation.inputTokens,
      outputTokens: evaluation.outputTokens,
      evaluationModel: evaluation.model,
      qualityWarnings,
    });

    await trackServerEvent({
      name: "evaluation_completed",
      ...context,
      properties: {
        provider: evaluation.provider,
        model: evaluation.model,
        evaluatorVersion: evaluation.evaluatorVersion,
        rubricVersion: evaluation.rubricVersion,
        band: evaluation.result.scoring.band,
        provisional: evaluation.result.scoring.provisional,
        latencyMs: evaluation.latencyMs,
        processingDurationMs,
        modelCalls: evaluation.modelCalls,
        inputTokens: evaluation.inputTokens,
        outputTokens: evaluation.outputTokens,
        qualityWarningCount: qualityWarnings.length,
      },
    });
    if (attempt.previousAttemptId) {
      await trackServerEvent({
        name: "retry_completed",
        ...context,
        properties: {
          attemptNumber: attempt.attemptNumber,
          previousAttemptId: attempt.previousAttemptId,
          band: evaluation.result.scoring.band,
        },
      });
    }
  } catch (error) {
    const code = toFailureCode(error, stage);
    const processingDurationMs = Date.now() - runStartedAt;
    logger.error("Attempt processing failed", { ...context, stage, code, processingDurationMs, error });
    try {
      await repo.markAttemptFailed(attemptId, stage, code, processingDurationMs);
      await trackServerEvent({
        name: stage === "transcription" ? "transcription_failed" : "evaluation_failed",
        ...context,
        properties: { code, stageMs: Date.now() - stageStartedAt, processingDurationMs },
      });
    } catch (persistError) {
      // The database itself is failing, so the failure cannot be stored. The run must still never throw: the attempt
      // stays "processing" until it is detected as stalled, after which the student can restart it from the stored audio.
      logger.error("Could not record the processing failure", { ...context, error: persistError });
    }
  }
}

async function readAudio(storageKey: string): Promise<Buffer> {
  try {
    return await getAudioStorage().read(storageKey);
  } catch (error) {
    throw new ProviderError("audio_unavailable", "Could not read stored audio", {
      cause: error,
      retryable: !(error instanceof AudioNotFoundError),
    });
  }
}

/**
 * The evaluations table's overall_level column holds the headline result: a CEFR level for schema 1–2 rows, and
 * "band:N" for Multilevel (schema 3) rows. No overall exam level is ever derived from one part.
 */
export function bandHeadline(band: number): string {
  return `band:${band}`;
}

async function loadPreviousAttemptContext(attempt: repo.AttemptRow) {
  if (!attempt.previousAttemptId) return null;
  const previous = await repo.findAttempt(attempt.previousAttemptId);
  const previousTranscript = previous && await repo.findLatestTranscript(previous.id);
  const previousEvaluation = previous && await repo.findLatestEvaluation(previous.id);
  if (!previous || !previousTranscript || !previousEvaluation) return null;
  const evaluation = parseStoredEvaluation(previousEvaluation.schemaVersion, previousEvaluation.result);
  if (!evaluation) return null;
  const retryFocus = (attempt.retryFocus as RetryFocusItem[] | null) ?? evaluation.retry_focus;
  return {
    attemptNumber: previous.attemptNumber,
    transcript: previousTranscript.text,
    retryFocus: retryFocus.map(({ objective, success_check }) => ({ objective, success_check })),
  };
}

function toFailureCode(error: unknown, stage: ProcessingStage): FailureCode {
  if (error instanceof ProviderError) return error.failureCode;
  return stage === "transcription" ? "transcription_failed" : "evaluation_failed";
}

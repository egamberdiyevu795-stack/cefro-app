import "server-only";
import type { RetryFocusItem } from "@/domain/evaluation/schema";
import { parseStoredEvaluation } from "@/domain/evaluation/stored";
import type { FailureCode, ProcessingStage } from "@/domain/speaking/attempt";
import { computeSpeechMetrics, type SpeechMetrics } from "@/domain/speaking/metrics";
import { getSpeakingTask } from "@/content/speaking";
import { trackServerEvent } from "@/server/analytics/track";
import { ProviderError } from "@/server/errors";
import { evaluateSpeaking, getEvaluationModel } from "@/server/evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { logger } from "@/server/logging/logger";
import { AudioNotFoundError, getAudioStorage } from "@/server/storage";
import { getTranscriptionProvider } from "@/server/transcription";
import * as repo from "./attempt-repository";
import { PROCESSING_STALE_AFTER_MS } from "./attempt-views";

/** Fewer recognised words than this means there is nothing meaningful to assess. */
const MIN_TRANSCRIPT_WORDS = 5;

/**
 * Atomically mark an attempt as "processing". Returns false when it is
 * already being processed (and not stalled) or already completed, which is
 * what prevents two concurrent pipelines for the same attempt.
 */
export function claimAttempt(attemptId: string): boolean {
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_AFTER_MS).toISOString();
  const claimed = repo.claimAttemptForProcessing(attemptId, staleBefore);
  if (!claimed) logger.info("Attempt not claimable; skipping processing", { attemptId });
  return claimed;
}

/** Claim and process in one call (used by tests and scripts). */
export async function processAttempt(attemptId: string): Promise<void> {
  if (claimAttempt(attemptId)) await runClaimedAttempt(attemptId);
}

/**
 * Process a claimed attempt: transcription → evaluation → completed.
 *
 * A transcript saved by an earlier (failed) run is reused instead of
 * transcribing again, so retrying after an evaluation failure is cheap.
 * Never throws — failures are stored on the attempt.
 */
export async function runClaimedAttempt(attemptId: string): Promise<void> {
  const attempt = repo.findAttempt(attemptId);
  if (!attempt) return;
  const context = { userId: attempt.userId, taskId: attempt.taskId, attemptId };
  let stage: ProcessingStage = "transcription";
  const runStartedAt = Date.now();
  let stageStartedAt = runStartedAt;
  let transcriptionMs: number | null = null;

  try {
    const task = getSpeakingTask(attempt.taskId);
    if (!task) throw new Error(`Task ${attempt.taskId} no longer exists`);
    const recording = repo.findRecording(attemptId);
    if (!recording) throw new ProviderError("audio_unavailable", "Recording row missing", { retryable: false });

    // ── Transcription ───────────────────────────────────────────────
    let transcript = repo.findLatestTranscript(attemptId);
    let metrics = attempt.metrics as SpeechMetrics | null;
    if (!transcript || !metrics) {
      repo.setAttemptStatus(attemptId, "transcribing");
      const provider = getTranscriptionProvider();
      trackServerEvent({ name: "transcription_started", ...context, properties: { provider: provider.name } });

      const audio = await readAudio(recording.storageKey);
      stageStartedAt = Date.now();
      const output = await provider.transcribe({ audio, mimeType: recording.mimeType, language: "en" });
      const latencyMs = Date.now() - stageStartedAt;
      transcriptionMs = latencyMs;

      metrics = computeSpeechMetrics(output.text, recording.durationMs, task.speakingSeconds);
      if (metrics.wordCount < MIN_TRANSCRIPT_WORDS) {
        throw new ProviderError("transcription_empty", `Only ${metrics.wordCount} words recognised`, {
          retryable: false,
        });
      }
      transcript = repo.saveTranscript({
        attemptId,
        provider: provider.name,
        model: provider.model,
        text: output.text,
        language: output.language,
        latencyMs,
        metrics,
      });
      trackServerEvent({
        name: "transcription_completed",
        ...context,
        properties: { provider: provider.name, model: provider.model, latencyMs, wordCount: metrics.wordCount },
      });
    }

    // ── Evaluation ──────────────────────────────────────────────────
    stage = "evaluation";
    stageStartedAt = Date.now();
    repo.setAttemptStatus(attemptId, "evaluating");
    const model = getEvaluationModel();
    trackServerEvent({ name: "evaluation_started", ...context, properties: { provider: model.provider, model: model.model } });

    const evaluation = await evaluateSpeaking(
      {
        task,
        rubric: getSpeakingRubric(task.level),
        transcript: transcript.text,
        metrics,
        audio: {
          storageProvider: recording.storageProvider,
          storageKey: recording.storageKey,
          mimeType: recording.mimeType,
          durationMs: recording.durationMs,
        },
        previousAttempt: loadPreviousAttemptContext(attempt),
      },
      model,
    );

    const processingDurationMs = Date.now() - runStartedAt;
    const qualityWarnings = evaluation.quality.violations.map((v) => v.code);
    repo.saveEvaluationAndComplete({
      attemptId,
      transcriptId: transcript.id,
      evaluatorVersion: evaluation.evaluatorVersion,
      rubricVersion: evaluation.rubricVersion,
      schemaVersion: evaluation.schemaVersion,
      promptHash: evaluation.promptHash,
      provider: evaluation.provider,
      model: evaluation.model,
      modelConfig: { requestedModel: model.model, ...evaluation.modelConfig },
      modelCalls: evaluation.modelCalls,
      qualityReport: {
        warnings: evaluation.quality.violations,
        rejectedDrafts: evaluation.quality.rejectedDrafts,
      },
      overallLevel: evaluation.result.overall_level,
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

    trackServerEvent({
      name: "evaluation_completed",
      ...context,
      properties: {
        provider: evaluation.provider,
        model: evaluation.model,
        evaluatorVersion: evaluation.evaluatorVersion,
        rubricVersion: evaluation.rubricVersion,
        overallLevel: evaluation.result.overall_level,
        latencyMs: evaluation.latencyMs,
        processingDurationMs,
        modelCalls: evaluation.modelCalls,
        inputTokens: evaluation.inputTokens,
        outputTokens: evaluation.outputTokens,
        qualityWarningCount: qualityWarnings.length,
      },
    });
    if (attempt.previousAttemptId) {
      trackServerEvent({
        name: "retry_completed",
        ...context,
        properties: {
          attemptNumber: attempt.attemptNumber,
          previousAttemptId: attempt.previousAttemptId,
          overallLevel: evaluation.result.overall_level,
        },
      });
    }
  } catch (error) {
    const code = toFailureCode(error, stage);
    const processingDurationMs = Date.now() - runStartedAt;
    logger.error("Attempt processing failed", { ...context, stage, code, processingDurationMs, error });
    repo.markAttemptFailed(attemptId, stage, code, processingDurationMs);
    trackServerEvent({
      name: stage === "transcription" ? "transcription_failed" : "evaluation_failed",
      ...context,
      properties: { code, stageMs: Date.now() - stageStartedAt, processingDurationMs },
    });
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

function loadPreviousAttemptContext(attempt: repo.AttemptRow) {
  if (!attempt.previousAttemptId) return null;
  const previous = repo.findAttempt(attempt.previousAttemptId);
  const previousTranscript = previous && repo.findLatestTranscript(previous.id);
  const previousEvaluation = previous && repo.findLatestEvaluation(previous.id);
  if (!previous || !previousTranscript || !previousEvaluation) return null;
  const evaluation = parseStoredEvaluation(previousEvaluation.schemaVersion, previousEvaluation.result);
  if (!evaluation) return null;
  return {
    attemptNumber: previous.attemptNumber,
    transcript: previousTranscript.text,
    evaluation,
    retryFocus: (attempt.retryFocus as RetryFocusItem[] | null) ?? evaluation.retry_focus,
  };
}

function toFailureCode(error: unknown, stage: ProcessingStage): FailureCode {
  if (error instanceof ProviderError) return error.failureCode;
  return stage === "transcription" ? "transcription_failed" : "evaluation_failed";
}

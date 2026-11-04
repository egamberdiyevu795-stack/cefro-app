import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FailureCode } from "@/domain/speaking/attempt";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { evaluations, recordings, speakingAttempts, transcripts, users } from "@/server/db/schema";
import { ProviderError } from "@/server/errors";
import { setEvaluationModelForTesting, type EvaluationModel } from "@/server/evaluation";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTranscriptionProviderForTesting, type TranscriptionProvider } from "@/server/transcription";
import { FIXTURE_TRANSCRIPT, fakeWebm, makeModelOutput } from "../../../test/fixtures";
import { claimAttempt, processAttempt, runClaimedAttempt } from "./attempt-processing";
import { createAttempt, getAttemptViewForUser } from "./attempt-service";

/**
 * Failure-path validation with injected providers (no real provider is called, and no live failure is provoked).
 * For every way the pipeline can fail, the resulting application state must be clear and recoverable:
 * the attempt is `failed` with a stage and a stable code, the recording is kept, no half-written evaluation exists,
 * the database has no dangling reference, and (where the fault is transient) a restart completes the attempt.
 */
const USER = "11111111-1111-4111-8111-111111111111";
const never = () => new Promise<never>(() => undefined);

let db: Db;
let dir: string;
let stt: TranscriptionProvider & { transcribe: ReturnType<typeof vi.fn> };
let llm: EvaluationModel & { evaluate: ReturnType<typeof vi.fn> };

const goodOutput = () => ({ output: makeModelOutput(), provider: "fake-llm", model: "fake-llm-1", inputTokens: 10, outputTokens: 20 });

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  await db.insert(users).values({ id: USER }).run();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-failures-"));
  setAudioStorageForTesting(new LocalAudioStorage(dir));
  stt = { name: "fake-stt", model: "fake-stt-1", transcribe: vi.fn(async () => ({ text: FIXTURE_TRANSCRIPT, language: "en" })) };
  llm = { provider: "fake-llm", model: "fake-llm-1", isDevelopmentProvider: false, config: {}, evaluate: vi.fn(async () => goodOutput()) };
  setTranscriptionProviderForTesting(stt);
  setEvaluationModelForTesting(llm);
});
afterEach(async () => {
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  setTranscriptionProviderForTesting(undefined);
  setEvaluationModelForTesting(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

async function newAttempt() {
  return createAttempt({
    userId: USER,
    taskId: "b2-part2-technology-young-people",
    audio: fakeWebm(),
    mimeType: "audio/webm;codecs=opus",
    durationMs: 95_000,
    previousAttemptId: null,
  });
}

/** What must be true after ANY failed run. */
async function expectCleanFailure(attemptId: string, expected: { stage: "transcription" | "evaluation"; code: FailureCode }) {
  const view = await getAttemptViewForUser(USER, attemptId);
  expect(view).toMatchObject({ status: "failed", failure: expected, evaluation: null, isStalled: false });

  const row = (await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attemptId)).get())!;
  expect(row.failureStage).toBe(expected.stage);
  expect(row.processingDurationMs).not.toBeNull();
  expect(row.completedAt).toBeNull();

  const recording = (await db.select().from(recordings).where(eq(recordings.attemptId, attemptId)).get())!;
  expect(recording).toBeTruthy();
  await expect(new LocalAudioStorage(dir).read(recording.storageKey)).resolves.toBeInstanceOf(Buffer); // audio kept for the restart
  expect(await db.select().from(evaluations).where(eq(evaluations.attemptId, attemptId)).all()).toHaveLength(0); // no half-written evaluation
  expect((await db.$client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
}

async function expectRestartCompletes(attemptId: string) {
  await processAttempt(attemptId);
  expect((await getAttemptViewForUser(USER, attemptId)).status).toBe("completed");
  expect(await db.select().from(evaluations).where(eq(evaluations.attemptId, attemptId)).all()).toHaveLength(1);
}

describe("transcription failures", () => {
  it("timeout (provider hangs): ends inside the budget as provider_timeout, restartable", async () => {
    stt.transcribe.mockImplementationOnce(never);
    const attempt = await newAttempt();
    expect(await claimAttempt(attempt.id)).toBe(true);
    await runClaimedAttempt(attempt.id, { budgetMs: 120 });
    await expectCleanFailure(attempt.id, { stage: "transcription", code: "provider_timeout" });
    await expectRestartCompletes(attempt.id);
  });

  it("API error: stored as transcription_failed, restartable", async () => {
    stt.transcribe.mockRejectedValueOnce(new ProviderError("transcription_failed", "HTTP 500"));
    const attempt = await newAttempt();
    await processAttempt(attempt.id);
    await expectCleanFailure(attempt.id, { stage: "transcription", code: "transcription_failed" });
    await expectRestartCompletes(attempt.id);
  });

  it("rate limit: stored as provider_rate_limited, restartable", async () => {
    stt.transcribe.mockRejectedValueOnce(new ProviderError("provider_rate_limited", "429"));
    const attempt = await newAttempt();
    await processAttempt(attempt.id);
    await expectCleanFailure(attempt.id, { stage: "transcription", code: "provider_rate_limited" });
    await expectRestartCompletes(attempt.id);
  });

  it("unsupported audio and a missing key: stored with their own codes (not retryable, never retried automatically)", async () => {
    for (const code of ["audio_unsupported", "provider_not_configured"] as const) {
      stt.transcribe.mockRejectedValueOnce(new ProviderError(code, "x", { retryable: false }));
      const attempt = await newAttempt();
      await processAttempt(attempt.id);
      await expectCleanFailure(attempt.id, { stage: "transcription", code });
      expect(stt.transcribe).toHaveBeenCalledTimes(1 + (code === "provider_not_configured" ? 1 : 0)); // exactly one call per attempt
    }
  });

  it("silence / too little speech: transcription_empty, and nothing is evaluated", async () => {
    stt.transcribe.mockResolvedValueOnce({ text: "", language: "en" });
    const attempt = await newAttempt();
    await processAttempt(attempt.id);
    await expectCleanFailure(attempt.id, { stage: "transcription", code: "transcription_empty" });
    expect(llm.evaluate).not.toHaveBeenCalled();
    expect(await db.select().from(transcripts).where(eq(transcripts.attemptId, attempt.id)).all()).toHaveLength(0); // no fabricated transcript stored
  });
});

describe("evaluation failures", () => {
  it("timeout (provider hangs): ends inside the budget as provider_timeout; the transcript is kept, not re-bought", async () => {
    llm.evaluate.mockImplementationOnce(never);
    const attempt = await newAttempt();
    expect(await claimAttempt(attempt.id)).toBe(true);
    await runClaimedAttempt(attempt.id, { budgetMs: 120 });
    await expectCleanFailure(attempt.id, { stage: "evaluation", code: "provider_timeout" });
    expect(await db.select().from(transcripts).where(eq(transcripts.attemptId, attempt.id)).all()).toHaveLength(1);
    await expectRestartCompletes(attempt.id);
    expect(stt.transcribe).toHaveBeenCalledTimes(1);
  });

  it("API error: stored as evaluation_failed (no regeneration for provider failures), restartable", async () => {
    llm.evaluate.mockRejectedValueOnce(new ProviderError("evaluation_failed", "HTTP 500"));
    const attempt = await newAttempt();
    await processAttempt(attempt.id);
    await expectCleanFailure(attempt.id, { stage: "evaluation", code: "evaluation_failed" });
    expect(llm.evaluate).toHaveBeenCalledTimes(1);
    await expectRestartCompletes(attempt.id);
  });

  it("refusal: stored as evaluation_refused", async () => {
    llm.evaluate.mockRejectedValueOnce(new ProviderError("evaluation_refused", "blocked", { retryable: false }));
    const attempt = await newAttempt();
    await processAttempt(attempt.id);
    await expectCleanFailure(attempt.id, { stage: "evaluation", code: "evaluation_refused" });
  });

  it("malformed output twice: one regeneration, then evaluation_invalid_output", async () => {
    llm.evaluate.mockResolvedValue({ output: "this is not json {", provider: "fake-llm", model: "fake-llm-1", inputTokens: 5, outputTokens: 5 });
    const attempt = await newAttempt();
    await processAttempt(attempt.id);
    expect(llm.evaluate).toHaveBeenCalledTimes(2);
    await expectCleanFailure(attempt.id, { stage: "evaluation", code: "evaluation_invalid_output" });
    llm.evaluate.mockImplementation(async () => goodOutput());
    await expectRestartCompletes(attempt.id);
  });

  it("provider reports unusable (empty/truncated) output twice: evaluation_invalid_output", async () => {
    llm.evaluate.mockRejectedValue(new ProviderError("evaluation_invalid_output", "response was empty"));
    const attempt = await newAttempt();
    await processAttempt(attempt.id);
    expect(llm.evaluate).toHaveBeenCalledTimes(2);
    await expectCleanFailure(attempt.id, { stage: "evaluation", code: "evaluation_invalid_output" });
  });

  it("quality-gate rejection on both drafts (regeneration exhausted): evaluation_quality_rejected, nothing stored", async () => {
    const hallucinated = makeModelOutput();
    hallucinated.features.grammar.evidence = ["words the student never said"];
    llm.evaluate.mockResolvedValue({ output: hallucinated, provider: "fake-llm", model: "fake-llm-1", inputTokens: 5, outputTokens: 5 });
    const attempt = await newAttempt();
    await processAttempt(attempt.id);
    expect(llm.evaluate).toHaveBeenCalledTimes(2); // first draft + exactly one regeneration
    await expectCleanFailure(attempt.id, { stage: "evaluation", code: "evaluation_quality_rejected" });
    llm.evaluate.mockImplementation(async () => goodOutput());
    await expectRestartCompletes(attempt.id);
  });

  it("quality-gate rejection that the regeneration fixes: completes, and records both calls and why the first was rejected", async () => {
    const hallucinated = makeModelOutput();
    hallucinated.features.grammar.evidence = ["words the student never said"];
    llm.evaluate
      .mockResolvedValueOnce({ output: hallucinated, provider: "fake-llm", model: "fake-llm-1", inputTokens: 5, outputTokens: 5 })
      .mockResolvedValueOnce(goodOutput());
    const attempt = await newAttempt();
    await processAttempt(attempt.id);
    const row = (await db.select().from(evaluations).where(eq(evaluations.attemptId, attempt.id)).get())!;
    expect((await getAttemptViewForUser(USER, attempt.id)).status).toBe("completed");
    expect(row.modelCalls).toBe(2);
    expect(row.inputTokens).toBe(15); // both calls are counted
    expect(JSON.stringify(row.qualityReport)).toContain("feature_evidence_fabricated");
  });
});

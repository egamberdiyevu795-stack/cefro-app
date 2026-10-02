import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { analyticsEvents, evaluations, users } from "@/server/db/schema";
import { ProviderError } from "@/server/errors";
import { setEvaluationModelForTesting, type EvaluationModel } from "@/server/evaluation";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTranscriptionProviderForTesting, type TranscriptionProvider } from "@/server/transcription";
import { makeEvaluation } from "../../../test/fixtures";
import { claimAttempt, processAttempt } from "./attempt-processing";
import { createAttempt, getAttemptViewForUser, listAttemptSummaries } from "./attempt-service";

const TASK_ID = "b2-part2-technology-young-people";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const TRANSCRIPT = "In my opinion technology helps young people stay in touch with their friends every day.";

let db: Db;
let storageDir: string;
let transcription: TranscriptionProvider & { transcribe: ReturnType<typeof vi.fn> };
let evaluation: EvaluationModel & { evaluate: ReturnType<typeof vi.fn> };

beforeEach(() => {
  db = openDatabase(":memory:");
  setDbForTesting(db);
  db.insert(users).values([{ id: USER }, { id: OTHER_USER }]).run();
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-audio-"));
  setAudioStorageForTesting(new LocalAudioStorage(storageDir));
  transcription = {
    name: "fake-stt",
    model: "fake-stt-1",
    transcribe: vi.fn(async () => ({ text: TRANSCRIPT, language: "en" })),
  };
  evaluation = {
    provider: "fake-llm",
    model: "fake-llm-1",
    isDevelopmentProvider: false,
    evaluate: vi.fn(async () => ({
      output: makeEvaluation(),
      provider: "fake-llm",
      model: "fake-llm-1",
      inputTokens: 100,
      outputTokens: 200,
    })),
  };
  setTranscriptionProviderForTesting(transcription);
  setEvaluationModelForTesting(evaluation);
});

afterEach(() => {
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  setTranscriptionProviderForTesting(undefined);
  setEvaluationModelForTesting(undefined);
  fs.rmSync(storageDir, { recursive: true, force: true });
});

function submit(previousAttemptId: string | null = null, userId = USER) {
  return createAttempt({
    userId,
    taskId: TASK_ID,
    audio: Buffer.from("fake-audio-bytes"),
    mimeType: "audio/webm;codecs=opus",
    durationMs: 95_000,
    previousAttemptId,
  });
}

function eventNames() {
  return db.select().from(analyticsEvents).all().map((e) => e.name);
}

describe("speaking attempt pipeline", () => {
  it("stores audio, transcribes, evaluates and completes an attempt", async () => {
    const created = await submit();
    expect(created).toMatchObject({ status: "uploaded", attemptNumber: 1, recordingDurationMs: 95_000 });
    expect(fs.readdirSync(path.join(storageDir, "speaking", USER))).toHaveLength(1);

    await processAttempt(created.id);
    const view = getAttemptViewForUser(USER, created.id);

    expect(view.status).toBe("completed");
    expect(view.transcript).toEqual({ text: TRANSCRIPT, provider: "fake-stt", model: "fake-stt-1" });
    expect(view.metrics?.wordCount).toBe(15);
    expect(view.evaluation?.result.overall_level).toBe("B1+");
    expect(view.evaluation?.meta).toMatchObject({
      evaluatorVersion: "speaking-evaluator/1.0.0",
      rubricVersion: "b2-speaking-rubric/1.0.0",
      schemaVersion: 1,
      provider: "fake-llm",
      model: "fake-llm-1",
      isDevelopmentProvider: false,
    });
    const stored = db.select().from(evaluations).where(eq(evaluations.attemptId, created.id)).get();
    expect(stored?.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.inputTokens).toBe(100);

    expect(eventNames()).toEqual(
      expect.arrayContaining([
        "recording_submitted",
        "transcription_started",
        "transcription_completed",
        "evaluation_started",
        "evaluation_completed",
      ]),
    );
  });

  it("links a retry to the previous attempt and gives the evaluator its context", async () => {
    const first = await submit();
    await processAttempt(first.id);

    const second = await submit(first.id);
    expect(second.attemptNumber).toBe(2);
    expect(second.previousAttemptId).toBe(first.id);
    expect(second.retryFocus?.[0].objective).toBe("Use 'I think' at most once");

    await processAttempt(second.id);
    const input = evaluation.evaluate.mock.calls[1][1];
    expect(input.previousAttempt).toMatchObject({ attemptNumber: 1, transcript: TRANSCRIPT });
    expect(eventNames()).toContain("retry_completed");

    const summaries = listAttemptSummaries(USER, TASK_ID);
    expect(summaries.map((s) => s.attemptNumber)).toEqual([2, 1]);
    expect(summaries[0].overallLevel).toBe("B1+");
  });

  it("marks transcription failures with a code and keeps the audio for a retry", async () => {
    transcription.transcribe.mockRejectedValueOnce(new ProviderError("provider_timeout", "timeout"));
    const attempt = await submit();
    await processAttempt(attempt.id);

    let view = getAttemptViewForUser(USER, attempt.id);
    expect(view.status).toBe("failed");
    expect(view.failure).toEqual({ stage: "transcription", code: "provider_timeout" });
    expect(eventNames()).toContain("transcription_failed");

    await processAttempt(attempt.id);
    view = getAttemptViewForUser(USER, attempt.id);
    expect(view.status).toBe("completed");
  });

  it("reuses the saved transcript when only evaluation failed", async () => {
    evaluation.evaluate.mockRejectedValueOnce(new ProviderError("evaluation_failed", "500"));
    const attempt = await submit();
    await processAttempt(attempt.id);
    expect(getAttemptViewForUser(USER, attempt.id).failure).toEqual({ stage: "evaluation", code: "evaluation_failed" });

    await processAttempt(attempt.id);
    expect(getAttemptViewForUser(USER, attempt.id).status).toBe("completed");
    expect(transcription.transcribe).toHaveBeenCalledTimes(1);
  });

  it("fails with transcription_empty for (near-)silent recordings", async () => {
    transcription.transcribe.mockResolvedValueOnce({ text: "um", language: "en" });
    const attempt = await submit();
    await processAttempt(attempt.id);
    expect(getAttemptViewForUser(USER, attempt.id).failure?.code).toBe("transcription_empty");
  });

  it("fails cleanly when the model keeps returning malformed JSON", async () => {
    evaluation.evaluate.mockResolvedValue({ output: "{oops", provider: "fake-llm", model: "m", inputTokens: null, outputTokens: null });
    const attempt = await submit();
    await processAttempt(attempt.id);
    expect(getAttemptViewForUser(USER, attempt.id).failure).toEqual({
      stage: "evaluation",
      code: "evaluation_invalid_output",
    });
    expect(db.select().from(evaluations).all()).toHaveLength(0);
  });

  it("does not let two runs process the same attempt", async () => {
    const attempt = await submit();
    expect(claimAttempt(attempt.id)).toBe(true);
    expect(claimAttempt(attempt.id)).toBe(false);
  });

  it("hides other users' attempts and rejects retries of them", async () => {
    const attempt = await submit();
    expect(() => getAttemptViewForUser(OTHER_USER, attempt.id)).toThrow(/could not be found/);
    await expect(submit(attempt.id, OTHER_USER)).rejects.toMatchObject({ code: "invalid_previous_attempt" });
  });

  it("validates uploads", async () => {
    await expect(
      createAttempt({ userId: USER, taskId: TASK_ID, audio: Buffer.alloc(0), mimeType: "audio/webm", durationMs: 1, previousAttemptId: null }),
    ).rejects.toMatchObject({ code: "empty_audio" });
    await expect(
      createAttempt({ userId: USER, taskId: TASK_ID, audio: Buffer.from("x"), mimeType: "video/mp4", durationMs: 1, previousAttemptId: null }),
    ).rejects.toMatchObject({ code: "unsupported_audio" });
    await expect(
      createAttempt({ userId: USER, taskId: "nope", audio: Buffer.from("x"), mimeType: "audio/webm", durationMs: 1, previousAttemptId: null }),
    ).rejects.toMatchObject({ code: "task_not_found" });
  });
});

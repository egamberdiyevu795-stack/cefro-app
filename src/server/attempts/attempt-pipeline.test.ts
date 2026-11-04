import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { analyticsEvents, evaluations, practiceSessions, speakingAttempts, users } from "@/server/db/schema";
import { ProviderError } from "@/server/errors";
import { setEvaluationModelForTesting, type EvaluationModel } from "@/server/evaluation";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTranscriptionProviderForTesting, type TranscriptionProvider } from "@/server/transcription";
import { FIXTURE_TRANSCRIPT, fakeWebm, makeModelOutput } from "../../../test/fixtures";
import { claimAttempt, processAttempt, runClaimedAttempt } from "./attempt-processing";
import { createAttempt, getAttemptViewForUser, listAttemptSummaries } from "./attempt-service";

const TASK_ID = "b2-part2-advice-from-someone";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const TRANSCRIPT = FIXTURE_TRANSCRIPT;

let db: Db;
let storageDir: string;
let transcription: TranscriptionProvider & { transcribe: ReturnType<typeof vi.fn> };
let evaluation: EvaluationModel & { evaluate: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  await db.insert(users).values([{ id: USER }, { id: OTHER_USER }]).run();
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
    config: { effort: "high" },
    evaluate: vi.fn(async () => ({
      output: makeModelOutput(),
      provider: "fake-llm",
      model: "fake-llm-1",
      inputTokens: 100,
      outputTokens: 200,
    })),
  };
  setTranscriptionProviderForTesting(transcription);
  setEvaluationModelForTesting(evaluation);
});

afterEach(async () => {
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
    audio: fakeWebm(),
    mimeType: "audio/webm;codecs=opus",
    durationMs: 95_000,
    previousAttemptId,
  });
}

async function eventNames() {
  return (await db.select().from(analyticsEvents).all()).map((e) => e.name);
}

describe("speaking attempt pipeline", () => {
  it("stores audio, transcribes, evaluates and completes an attempt", async () => {
    const created = await submit();
    expect(created).toMatchObject({ status: "uploaded", attemptNumber: 1, recordingDurationMs: 95_000 });
    expect(fs.readdirSync(path.join(storageDir, "speaking", USER))).toHaveLength(1);

    await processAttempt(created.id);
    const view = await getAttemptViewForUser(USER, created.id);

    expect(view.status).toBe("completed");
    expect(view.transcript).toEqual({ text: TRANSCRIPT, provider: "fake-stt", model: "fake-stt-1" });
    expect(view.metrics?.wordCount).toBe(39);
    const result = view.evaluation?.result;
    expect(result?.kind).toBe("multilevel");
    // FIXTURE output: B1 language (3 of 4 features B1, fluency B2 → mean 1.25 → B1), 2 questions on topic → band 2.
    expect(result?.kind === "multilevel" && result.scoring).toMatchObject({ band: 2, label: "Higher B1", meets_target: false, provisional: true });
    expect(view.evaluation?.meta).toMatchObject({
      evaluatorVersion: "speaking-evaluator/3.4.0",
      rubricVersion: "multilevel-q7/2.1.0",
      schemaVersion: 3,
      provider: "fake-llm",
      model: "fake-llm-1",
      isDevelopmentProvider: false,
    });
    const stored = await db.select().from(evaluations).where(eq(evaluations.attemptId, created.id)).get();
    expect(stored?.promptHash).toMatch(/^h2:[a-f0-9]{64}$/);
    expect(stored?.overallLevel).toBe("band:2");
    expect(stored).toMatchObject({
      inputTokens: 100,
      outputTokens: 200,
      modelCalls: 1,
      modelConfig: { requestedModel: "fake-llm-1", effort: "high" },
    });
    expect(stored?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(view.evaluation?.meta.latencyMs).toBe(stored?.latencyMs);

    expect(await eventNames()).toEqual(
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
    // Language caps the band (B1 → 2) below coverage (2 on topic → 3), so the first focus is the lowest feature
    // (grammar), the second the unanswered question 3, numbered as the student sees it.
    expect(second.retryFocus?.map((f) => f.objective)).toEqual([
      makeModelOutput().features.grammar.how_to_improve,
      'Answer question 3: "Do you think young people should always follow advice from older people? Why or why not?"',
    ]);

    await processAttempt(second.id);
    const input = evaluation.evaluate.mock.calls[1][1];
    expect(input.previousAttempt).toMatchObject({ attemptNumber: 1, transcript: TRANSCRIPT });
    expect(input.previousAttempt?.retryFocus).toHaveLength(2);
    expect(await eventNames()).toContain("retry_completed");

    const summaries = await listAttemptSummaries(USER, TASK_ID);
    expect(summaries.map((s) => s.attemptNumber)).toEqual([2, 1]);
    expect(summaries[0].band).toEqual({ band: 2, bandMax: 5, label: "Higher B1", provisional: true });
  });

  it("marks transcription failures with a code and keeps the audio for a retry", async () => {
    transcription.transcribe.mockRejectedValueOnce(new ProviderError("provider_timeout", "timeout"));
    const attempt = await submit();
    await processAttempt(attempt.id);

    let view = await getAttemptViewForUser(USER, attempt.id);
    expect(view.status).toBe("failed");
    expect(view.failure).toEqual({ stage: "transcription", code: "provider_timeout" });
    expect(await eventNames()).toContain("transcription_failed");

    await processAttempt(attempt.id);
    view = await getAttemptViewForUser(USER, attempt.id);
    expect(view.status).toBe("completed");
  });

  it("reuses the saved transcript when only evaluation failed", async () => {
    evaluation.evaluate.mockRejectedValueOnce(new ProviderError("evaluation_failed", "500"));
    const attempt = await submit();
    await processAttempt(attempt.id);
    expect((await getAttemptViewForUser(USER, attempt.id)).failure).toEqual({ stage: "evaluation", code: "evaluation_failed" });

    await processAttempt(attempt.id);
    expect((await getAttemptViewForUser(USER, attempt.id)).status).toBe("completed");
    expect(transcription.transcribe).toHaveBeenCalledTimes(1);
  });

  it("fails with transcription_empty for (near-)silent recordings", async () => {
    transcription.transcribe.mockResolvedValueOnce({ text: "um", language: "en" });
    const attempt = await submit();
    await processAttempt(attempt.id);
    expect((await getAttemptViewForUser(USER, attempt.id)).failure?.code).toBe("transcription_empty");
  });

  it("fails cleanly when the model keeps returning malformed JSON", async () => {
    evaluation.evaluate.mockResolvedValue({ output: "{oops", provider: "fake-llm", model: "m", inputTokens: null, outputTokens: null });
    const attempt = await submit();
    await processAttempt(attempt.id);
    expect((await getAttemptViewForUser(USER, attempt.id)).failure).toEqual({
      stage: "evaluation",
      code: "evaluation_invalid_output",
    });
    expect(await db.select().from(evaluations).all()).toHaveLength(0);
  });

  it("does not let two runs process the same attempt", async () => {
    const attempt = await submit();
    expect(await claimAttempt(attempt.id)).toBe(true);
    expect(await claimAttempt(attempt.id)).toBe(false);
  });

  it("records processing time, and failure details, on the attempt", async () => {
    evaluation.evaluate.mockRejectedValueOnce(new ProviderError("provider_rate_limited", "429"));
    const attempt = await submit();
    await processAttempt(attempt.id);
    const failedEvent = await db.select().from(analyticsEvents).where(eq(analyticsEvents.name, "evaluation_failed")).get();
    expect(failedEvent?.properties).toMatchObject({ code: "provider_rate_limited" });
    expect((await getAttemptViewForUser(USER, attempt.id)).failure?.code).toBe("provider_rate_limited");

    await processAttempt(attempt.id);
    const completed = await db.select().from(analyticsEvents).where(eq(analyticsEvents.name, "evaluation_completed")).get();
    expect(completed?.properties).toMatchObject({ modelCalls: 1, inputTokens: 100, outputTokens: 200 });
    expect((completed?.properties as { processingDurationMs: number }).processingDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("rejects malformed attempt ids as not found", async () => {
    await expect(getAttemptViewForUser(USER, "../../etc/passwd")).rejects.toThrow(/could not be found/);
  });

  it("hides other users' attempts and rejects retries of them", async () => {
    const attempt = await submit();
    await expect(getAttemptViewForUser(OTHER_USER, attempt.id)).rejects.toThrow(/could not be found/);
    await expect(submit(attempt.id, OTHER_USER)).rejects.toMatchObject({ code: "invalid_previous_attempt" });
  });

  it("validates uploads", async () => {
    await expect(
      createAttempt({ userId: USER, taskId: TASK_ID, audio: Buffer.alloc(0), mimeType: "audio/webm", durationMs: 1, previousAttemptId: null }),
    ).rejects.toMatchObject({ code: "empty_audio" });
    await expect(
      createAttempt({ userId: USER, taskId: TASK_ID, audio: fakeWebm(), mimeType: "video/mp4", durationMs: 1, previousAttemptId: null }),
    ).rejects.toMatchObject({ code: "unsupported_audio" });
    // Claimed type must match the actual bytes.
    await expect(
      createAttempt({ userId: USER, taskId: TASK_ID, audio: Buffer.from("<?php echo 'not audio'; ?>"), mimeType: "audio/webm", durationMs: 1, previousAttemptId: null }),
    ).rejects.toMatchObject({ code: "unsupported_audio" });
    await expect(
      createAttempt({ userId: USER, taskId: "nope", audio: fakeWebm(), mimeType: "audio/webm", durationMs: 1, previousAttemptId: null }),
    ).rejects.toMatchObject({ code: "task_not_found" });
  });

  it("gives every attempt a session, and links its server events to it", async () => {
    const attempt = await submit();
    const row = (await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attempt.id)).get())!;
    expect(row.sessionId).not.toBeNull();
    expect(await db.select().from(practiceSessions).where(eq(practiceSessions.id, row.sessionId!)).get()).toMatchObject({ userId: USER });

    await processAttempt(attempt.id);
    const events = await db.select().from(analyticsEvents).all();
    expect(events.length).toBeGreaterThanOrEqual(5);
    for (const event of events) expect(event.sessionId).toBe(row.sessionId); // submitted, transcription_*, evaluation_*
  });

  it("keeps a retry in the same session when the client sends the same session id", async () => {
    const first = await submit();
    const sessionId = (await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, first.id)).get())!.sessionId;
    await processAttempt(first.id);
    const retry = await createAttempt({
      userId: USER, taskId: TASK_ID, audio: fakeWebm(), mimeType: "audio/webm", durationMs: 95_000, previousAttemptId: first.id, sessionId,
    });
    expect((await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, retry.id)).get())?.sessionId).toBe(sessionId);
  });

  it("refuses a retry link to an attempt that does not exist (foreign key integrity)", async () => {
    await expect(db.insert(speakingAttempts).values({
        id: "99999999-9999-4999-8999-999999999999", userId: USER, taskId: TASK_ID, taskVersion: 1, attemptNumber: 9,
        previousAttemptId: "00000000-0000-4000-8000-000000000000", status: "uploaded", updatedAt: new Date().toISOString(),
      }).run()).rejects.toMatchObject({ cause: { message: expect.stringMatching(/FOREIGN KEY/) } });
  });

  describe("processing time budget", () => {
    const never = () => new Promise<never>(() => undefined);

    it("ends a hung transcription inside the budget with a stored, restartable failure", async () => {
      transcription.transcribe.mockImplementationOnce(never);
      const attempt = await submit();
      expect(await claimAttempt(attempt.id)).toBe(true);
      const startedAt = Date.now();
      await runClaimedAttempt(attempt.id, { budgetMs: 150 });
      expect(Date.now() - startedAt).toBeLessThan(2_000);
      expect(await getAttemptViewForUser(USER, attempt.id)).toMatchObject({ status: "failed", failure: { stage: "transcription", code: "provider_timeout" }, isStalled: false });

      // Restartable: the next run (within the run cap) completes normally.
      await processAttempt(attempt.id);
      expect((await getAttemptViewForUser(USER, attempt.id)).status).toBe("completed");
      expect((await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, attempt.id)).get())?.processingRuns).toBe(2);
    });

    it("ends a hung evaluation inside the budget, keeping the transcript for the restart", async () => {
      evaluation.evaluate.mockImplementationOnce(never);
      const attempt = await submit();
      expect(await claimAttempt(attempt.id)).toBe(true);
      await runClaimedAttempt(attempt.id, { budgetMs: 150 });
      expect(await getAttemptViewForUser(USER, attempt.id)).toMatchObject({ status: "failed", failure: { stage: "evaluation", code: "provider_timeout" } });

      await processAttempt(attempt.id);
      expect(transcription.transcribe).toHaveBeenCalledTimes(1); // not transcribed (or paid for) again
      expect((await getAttemptViewForUser(USER, attempt.id)).status).toBe("completed");
    });

    it("lets a slow but healthy run finish", async () => {
      evaluation.evaluate.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return { output: makeModelOutput(), provider: "fake-llm", model: "fake-llm-1", inputTokens: 1, outputTokens: 1 };
      });
      const attempt = await submit();
      expect(await claimAttempt(attempt.id)).toBe(true);
      await runClaimedAttempt(attempt.id, { budgetMs: 5_000 });
      expect((await getAttemptViewForUser(USER, attempt.id)).status).toBe("completed");
    });
  });

  it("returns the same attempt when a recording is resent with the same clientAttemptId", async () => {
    const clientAttemptId = "33333333-3333-4333-8333-333333333333";
    const input = {
      userId: USER,
      taskId: TASK_ID,
      audio: fakeWebm(),
      mimeType: "audio/webm",
      durationMs: 95_000,
      previousAttemptId: null,
      clientAttemptId,
    };
    const first = await createAttempt(input);
    const resent = await createAttempt(input);
    expect(first.id).toBe(clientAttemptId);
    expect(resent.id).toBe(first.id);
    expect(await db.select().from(speakingAttempts).all()).toHaveLength(1);
  });

  it("refuses a clientAttemptId that belongs to another user", async () => {
    const clientAttemptId = "44444444-4444-4444-8444-444444444444";
    const base = { taskId: TASK_ID, audio: fakeWebm(), mimeType: "audio/webm", durationMs: 95_000, previousAttemptId: null, clientAttemptId };
    await createAttempt({ ...base, userId: USER });
    await expect(createAttempt({ ...base, userId: OTHER_USER })).rejects.toMatchObject({ status: 409 });
    await expect(createAttempt({ ...base, userId: USER, clientAttemptId: "not-a-uuid" })).rejects.toMatchObject({ status: 400 });
  });
});

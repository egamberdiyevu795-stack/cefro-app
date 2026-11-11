import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getArgumentTask } from "@/content/speaking/part3";
import { resultPageState } from "@/features/result/view-model";
import { resultSourceFromAttempt } from "@/features/result/from-attempt";
import { isMultilevelQ8 } from "@/domain/evaluation/stored";
import { deleteAccount } from "@/server/account/delete-account";
import { deleteExpiredAudio } from "@/server/audio-retention/delete-expired-audio";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { evaluations, recordings, speakingAttempts, speakingTasks, transcripts, users } from "@/server/db/schema";
import { ProviderError } from "@/server/errors";
import { setArgumentEvaluationModelForTesting, setEvaluationModelForTesting, type ArgumentEvaluationModel, type EvaluationModel } from "@/server/evaluation";
import { MockArgumentModel } from "@/server/evaluation/mock-argument-model";
import { MockEvaluationModel } from "@/server/evaluation/mock-evaluation-model";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTranscriptionProviderForTesting, type TranscriptionProvider } from "@/server/transcription";
import { PART3_ANCHORS } from "../../../test/evaluation-samples/part3-anchors";
import { fakeWebm } from "../../../test/fixtures";
import { processAttempt } from "./attempt-processing";
import { createAttempt, getAttemptViewForUser, getRecordingAudio } from "./attempt-service";

/*
 * Part 3 through the real pipeline, with the mock providers only (no model is called): create attempt, upload audio,
 * process (transcribe + score), stored result. Part 3 is not live (`PART_LIVE["3"]` is off), so these tests pass their
 * own release rule, and one test checks the real rule refuses. The "AI score not ready yet" tests run for Parts 1, 2
 * and 3: scoring fails, the recording and transcript stay.
 */
const USER = "33333333-3333-4333-8333-333333333333";
const live = () => true;
const CARS = "c1-part3-cars-in-city-centres";
const ANSWER = PART3_ANCHORS.find((a) => a.id === "cars-A4")!.transcript;
const PART1_ANSWER = "At the weekend I usually play football in the park with my friends. My favourite food is plov because it is very tasty.";
const PART2_ANSWER = "I want to talk about advice from my father. When I was sixteen he told me to finish school, and I followed his advice.";

let db: Db;
let dir: string;
let transcript = ANSWER;

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  await db.insert(users).values([{ id: USER }]).run();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-p3-"));
  setAudioStorageForTesting(new LocalAudioStorage(dir));
  transcript = ANSWER;
  const stt: TranscriptionProvider = { name: "fake-stt", model: "fake-stt-1", transcribe: vi.fn(async () => ({ text: transcript, language: "en" })) };
  setTranscriptionProviderForTesting(stt);
  setEvaluationModelForTesting(new MockEvaluationModel({ delayMs: 0 }));
  setArgumentEvaluationModelForTesting(new MockArgumentModel());
});
afterEach(() => {
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  setTranscriptionProviderForTesting(undefined);
  setEvaluationModelForTesting(undefined);
  setArgumentEvaluationModelForTesting(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

const input = (taskId: string, extra: Record<string, unknown> = {}) => ({
  userId: USER,
  taskId,
  audio: fakeWebm(),
  mimeType: "audio/webm",
  durationMs: 110_000,
  previousAttemptId: null,
  ...extra,
});
const submit = (taskId = CARS, extra: Record<string, unknown> = {}) => createAttempt(input(taskId, extra), { isLive: live });
const rows = async (id: string) => ({
  attempt: (await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, id)).get())!,
  evaluation: await db.select().from(evaluations).where(eq(evaluations.attemptId, id)).get(),
  transcript: await db.select().from(transcripts).where(eq(transcripts.attemptId, id)).get(),
  recording: (await db.select().from(recordings).where(eq(recordings.attemptId, id)).get())!,
});

describe("Part 3 attempts: create, upload, process, stored result", () => {
  it("scores the answer and stores a Part 3 result with the points the student chose", async () => {
    const created = await submit(CARS, { chosenPoints: ["A2", "F1", "A1", "F2"] });
    expect(created.status).toBe("uploaded");
    await processAttempt(created.id);

    const view = await getAttemptViewForUser(USER, created.id);
    expect(view.status).toBe("completed");
    expect(view.transcript?.text).toBe(ANSWER);
    const result = view.evaluation!.result;
    expect(isMultilevelQ8(result)).toBe(true);
    if (!isMultilevelQ8(result)) return;
    // Normalised to list order, feedback only.
    expect(result.chosen_points).toEqual(["F1", "F2", "A1", "A2"]);
    expect(result.scoring.band_max).toBe(6);
    expect(view.evaluation!.meta).toMatchObject({ schemaVersion: 4, evaluatorVersion: "argument-evaluator/0.1.0", isDevelopmentProvider: true });

    const stored = await rows(created.id);
    expect(stored.evaluation).toMatchObject({ schemaVersion: 4, promptHash: expect.stringMatching(/^h2:[a-f0-9]{64}$/), overallLevel: `band:${result.scoring.band}` });
    expect(stored.attempt.metrics).toMatchObject({ chosenPoints: ["F1", "F2", "A1", "A2"], wordCount: expect.any(Number) });
    expect((await getRecordingAudio(USER, created.id)).data.byteLength).toBeGreaterThan(0);
    expect((await db.select().from(speakingTasks).where(eq(speakingTasks.id, CARS)).get())?.part).toBe(3);
  });

  it("ticked points that don't fit the task are dropped, the answer is still scored (feedback only)", async () => {
    for (const chosen of [["F1", "F2", "F3", "A1"], ["F1", "X9"], ["F1", "F1"], "nonsense", null]) {
      const created = await submit(CARS, { chosenPoints: chosen });
      await processAttempt(created.id);
      const result = (await getAttemptViewForUser(USER, created.id)).evaluation!.result;
      expect(isMultilevelQ8(result) && result.chosen_points).toEqual([]);
    }
  });

  it("a retry carries the previous Part 3 attempt's goal; another task's attempt is refused", async () => {
    const first = await submit();
    await processAttempt(first.id);
    const retry = await submit(CARS, { previousAttemptId: first.id });
    expect((await rows(retry.id)).attempt.retryFocus).not.toBeNull();
    await processAttempt(retry.id);
    expect((await getAttemptViewForUser(USER, retry.id)).status).toBe("completed");
    await expect(submit("c1-part3-sugar-tax", { previousAttemptId: first.id })).rejects.toMatchObject({ code: "invalid_previous_attempt" });
  });

  it("the real release rule refuses Part 3 while PART_LIVE['3'] is off: no attempt, no stored audio", async () => {
    await expect(createAttempt(input(CARS))).rejects.toMatchObject({ status: 404, code: "task_not_found" });
    expect(await db.select().from(speakingAttempts).all()).toHaveLength(0);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  it("every Part 3 topic exists as a task", () => {
    for (const id of [CARS, "c1-part3-smartphones-under-14", "c1-part3-sugar-tax"]) expect(getArgumentTask(id)).toBeDefined();
  });
});

const failing = (code: ConstructorParameters<typeof ProviderError>[0]) => ({
  provider: "gemini",
  model: "gemini-test",
  isDevelopmentProvider: false,
  config: {},
  evaluate: async () => {
    throw new ProviderError(code, "scoring unavailable (test)", { retryable: code !== "provider_not_configured" });
  },
});

describe("AI score not ready yet: scoring can't run, the recording and transcript stay (Parts 1, 2 and 3)", () => {
  const cases = [
    { part: "Part 3", taskId: CARS, answer: ANSWER, install: (m: object) => setArgumentEvaluationModelForTesting(m as ArgumentEvaluationModel), extra: { chosenPoints: ["F1", "A1"] } },
    { part: "Part 2", taskId: "b2-part2-advice-from-someone", answer: PART2_ANSWER, install: (m: object) => setEvaluationModelForTesting(m as EvaluationModel), extra: {} },
    { part: "Part 1.1", taskId: "a2-part1-1-daily-life", answer: PART1_ANSWER, install: (m: object) => setEvaluationModelForTesting(m as EvaluationModel), extra: {} },
    { part: "Part 1.2", taskId: "b1-part1-2-shopping", answer: PART1_ANSWER, install: (m: object) => setEvaluationModelForTesting(m as EvaluationModel), extra: {} },
  ];

  for (const { part, taskId, answer, install, extra } of cases) {
    for (const code of ["provider_not_configured", "provider_rate_limited", "evaluation_failed"] as const) {
      it(`${part}: ${code} keeps the recording and transcript; the page says "AI score not ready yet"; scoring runs later from the saved recording`, async () => {
        transcript = answer;
        install(failing(code));
        const created = await submit(taskId, extra);
        await processAttempt(created.id);

        const view = await getAttemptViewForUser(USER, created.id);
        expect(view.status).toBe("failed");
        expect(view.failure).toEqual({ stage: "evaluation", code });
        expect(view.transcript?.text).toBe(answer);
        expect(view.evaluation).toBeNull();
        const stored = await rows(created.id);
        expect(stored.recording.audioDeletedAt).toBeNull();
        expect((await getRecordingAudio(USER, created.id)).data.byteLength).toBeGreaterThan(0);

        // The result page's state: not an error screen but "AI score not ready yet" (aiPending), with the transcript.
        const source = resultSourceFromAttempt(view, { task: { id: taskId, title: "t", part: 2, prompts: [] }, bandLabels: [] });
        expect(resultPageState(source!)).toMatchObject({ kind: "failed", aiPending: true, transcript: answer });

        // Scoring becomes available again: the same recording is scored, no new answer needed.
        install(taskId === CARS ? new MockArgumentModel() : new MockEvaluationModel({ delayMs: 0 }));
        await processAttempt(created.id);
        expect((await getAttemptViewForUser(USER, created.id)).status).toBe("completed");
        expect((await rows(created.id)).recording.storageKey).toBe(stored.recording.storageKey);
      });
    }
  }

  it("a failure before the transcript exists is not 'AI score not ready yet'", async () => {
    setTranscriptionProviderForTesting({ name: "broken", model: "m", transcribe: async () => { throw new ProviderError("transcription_failed", "down"); } });
    const created = await submit();
    await processAttempt(created.id);
    const view = await getAttemptViewForUser(USER, created.id);
    expect(view.failure?.stage).toBe("transcription");
    const source = resultSourceFromAttempt(view, { task: { id: CARS, title: "t", part: 3, prompts: [] }, bandLabels: [] });
    expect(resultPageState(source!)).toMatchObject({ kind: "failed", aiPending: false });
  });
});

describe("Part 3 recordings: the 30-day audio deletion and account deletion", () => {
  it("audio of a Part 3 attempt is deleted 30 days after scoring; the transcript and result stay", async () => {
    const created = await submit();
    await processAttempt(created.id);
    const { recording } = await rows(created.id);
    expect(fs.existsSync(path.join(dir, recording.storageKey))).toBe(true);

    // Not yet due.
    expect((await deleteExpiredAudio({ files: new LocalAudioStorage(dir) })).deleted).toBe(0);
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    await db.update(speakingAttempts).set({ completedAt: old, updatedAt: old }).where(eq(speakingAttempts.id, created.id)).run();
    expect((await deleteExpiredAudio({ files: new LocalAudioStorage(dir) })).deleted).toBe(1);

    expect(fs.existsSync(path.join(dir, recording.storageKey))).toBe(false);
    const view = await getAttemptViewForUser(USER, created.id);
    expect(view.audio?.deletedAt).not.toBeNull();
    expect(view.transcript?.text).toBe(ANSWER);
    expect(isMultilevelQ8(view.evaluation!.result)).toBe(true);
  });

  it("a Part 3 attempt that could not be scored also loses its audio after 30 days", async () => {
    setArgumentEvaluationModelForTesting(failing("provider_not_configured") as ArgumentEvaluationModel);
    const created = await submit();
    await processAttempt(created.id);
    const { recording } = await rows(created.id);
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    await db.update(speakingAttempts).set({ updatedAt: old }).where(eq(speakingAttempts.id, created.id)).run();
    expect((await deleteExpiredAudio({ files: new LocalAudioStorage(dir) })).deleted).toBe(1);
    expect(fs.existsSync(path.join(dir, recording.storageKey))).toBe(false);
  });

  it("Delete my account removes Part 3 attempts, results, transcripts, recordings and the audio file", async () => {
    const scored = await submit(CARS, { chosenPoints: ["F1", "A1"] });
    await processAttempt(scored.id);
    setArgumentEvaluationModelForTesting(failing("evaluation_failed") as ArgumentEvaluationModel);
    const pending = await submit();
    await processAttempt(pending.id);
    const keys = [(await rows(scored.id)).recording.storageKey, (await rows(pending.id)).recording.storageKey];
    for (const key of keys) expect(fs.existsSync(path.join(dir, key))).toBe(true);

    const summary = await deleteAccount(USER);
    expect(summary).toMatchObject({ attempts: 2, recordings: 2, transcripts: 2, evaluations: 1, audioFiles: 2 });
    for (const table of [speakingAttempts, evaluations, transcripts, recordings]) expect(await db.select().from(table).all()).toHaveLength(0);
    for (const key of keys) expect(fs.existsSync(path.join(dir, key))).toBe(false);
    expect(await db.select().from(users).where(eq(users.id, USER)).get()).toBeUndefined();
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockEvaluationModel } from "@/server/evaluation/mock-evaluation-model";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { speakingAttempts, users } from "@/server/db/schema";
import { setEvaluationModelForTesting } from "@/server/evaluation";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTranscriptionProviderForTesting, type TranscriptionProvider } from "@/server/transcription";
import { fakeWebm } from "../../../test/fixtures";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import { processAttempt } from "./attempt-processing";
import { createAttempt, getAttemptViewForUser } from "./attempt-service";

/*
 * Part 1 through the real pipeline (docs/part1-plan.md §1, "Recording"): one recording per part, the question
 * offsets sent with the upload, kept with the attempt, turned into time per question and given to the evaluator.
 * Mock providers only. Part 1 is not live (`PART_LIVE`), so these tests pass their own release rule.
 */
const USER = "11111111-1111-4111-8111-111111111111";
const live = () => true;
const ANSWER =
  "At the weekend I usually play football in the park with my friends. My favourite food is plov because it is very tasty. I spend the most time with my mother, we cook together.";

let db: Db;
let storageDir: string;
let transcription: TranscriptionProvider & { transcribe: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  await db.insert(users).values([{ id: USER }]).run();
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-audio-"));
  setAudioStorageForTesting(new LocalAudioStorage(storageDir));
  transcription = { name: "fake-stt", model: "fake-stt-1", transcribe: vi.fn(async () => ({ text: ANSWER, language: "en" })) };
  setTranscriptionProviderForTesting(transcription);
  setEvaluationModelForTesting(new MockEvaluationModel({ delayMs: 0 }));
});

afterEach(() => {
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  setTranscriptionProviderForTesting(undefined);
  setEvaluationModelForTesting(undefined);
  fs.rmSync(storageDir, { recursive: true, force: true });
});

const attemptInput = (questionOffsetsMs: unknown, taskId: string) => ({
  userId: USER,
  taskId,
  audio: fakeWebm(),
  mimeType: "audio/webm",
  durationMs: 75_000,
  previousAttemptId: null,
  questionOffsetsMs,
});
const submit = (questionOffsetsMs: unknown, taskId = "a2-part1-1-daily-life") => createAttempt(attemptInput(questionOffsetsMs, taskId), { isLive: live });

describe("Part 1 attempts", () => {
  it("are refused while the part is not live (PART_LIVE off): no attempt, no stored audio", async () => {
    // The app's own rule (PART_LIVE), not the test's.
    await expect(createAttempt(attemptInput([0, 25_000, 50_000], "a2-part1-1-daily-life"))).rejects.toMatchObject({ status: 404, code: "task_not_found" });
    await expect(createAttempt(attemptInput([0, 40_000, 60_000], "b1-part1-2-shopping"))).rejects.toMatchObject({ status: 404 });
    expect(await db.select().from(speakingAttempts).all()).toHaveLength(0);
    expect(fs.readdirSync(storageDir)).toHaveLength(0);
  });

  it("keep the offsets with the attempt, add time per question to the metrics, and are scored on the Part 1.1 rubric", async () => {
    const created = await submit([0, 25_000, 50_000]);
    const row = await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, created.id)).get();
    expect(row?.metrics).toEqual({ questionOffsetsMs: [0, 25_000, 50_000] });
    // Before transcription the offsets are not shown as speech metrics.
    expect(created.metrics).toBeNull();

    await processAttempt(created.id);
    const view = await getAttemptViewForUser(USER, created.id);
    expect(view.status).toBe("completed");
    expect(view.metrics).toMatchObject({ questionOffsetsMs: [0, 25_000, 50_000], questionSeconds: [25, 25, 25] });
    const result = view.evaluation!.result as MultilevelResult;
    expect(result.rubric_id).toBe("multilevel-q1-3");
    expect(view.evaluation!.meta.rubricVersion).toBe("multilevel-q1-3/1.0.0");
    expect(result.assessment.features.cohesion).toBeUndefined();
    expect(Object.keys(result.feature_sources).sort()).toEqual(["fluency", "grammar", "pronunciation", "vocabulary"]);
    expect(result.assessment.questions.map((q) => q.status)).toEqual(["on_topic", "on_topic", "on_topic"]);
    expect(result.scoring.band).toBeGreaterThanOrEqual(2);
  });

  it("drop offsets that don't fit the task, and still score the answer", async () => {
    for (const bad of [[0, 25_000], [5, 10, 20], [0, 30_000, 20_000], [0, 1, 999_999], "nope", null]) {
      const created = await submit(bad);
      const row = await db.select().from(speakingAttempts).where(eq(speakingAttempts.id, created.id)).get();
      expect(row?.metrics, JSON.stringify(bad)).toBeNull();
      await processAttempt(created.id);
      expect((await getAttemptViewForUser(USER, created.id)).status).toBe("completed");
    }
  });

  it("Part 1.1 has no word floor: a three-word answer reaches the evaluator", async () => {
    transcription.transcribe.mockResolvedValueOnce({ text: "Football. Plov. Mother.", language: "en" });
    const created = await submit([0, 25_000, 50_000]);
    await processAttempt(created.id);
    const view = await getAttemptViewForUser(USER, created.id);
    expect(view.status).toBe("completed");
    expect((view.evaluation!.result as MultilevelResult).scoring.on_topic_count).toBe(3);
    expect((view.evaluation!.result as MultilevelResult).scoring.band).toBe(2);
  });

  it("Part 1.2 is scored on its own rubric, with question numbers 4–6 in the goal", async () => {
    transcription.transcribe.mockResolvedValueOnce({
      text: "In the first picture there is a seller at a stall outside. Markets are fresh and cheaper.",
      language: "en",
    });
    const created = await submit([0, 45_000, 75_000], "b1-part1-2-shopping");
    await processAttempt(created.id);
    const result = (await getAttemptViewForUser(USER, created.id)).evaluation!.result as MultilevelResult;
    expect(result.rubric_id).toBe("multilevel-q4-6");
    expect(result.assessment.questions[0].status).toBe("partial");
    expect(result.assessment.questions[0].note).toContain("compare the two pictures");
    expect(result.assessment.questions[2].status).toBe("missing");
    expect(result.retry_focus.some((f) => /^Answer question 6: /.test(f.objective))).toBe(true);
  });
});

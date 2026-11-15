import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSpeakingTask, listSpeakingTasks } from "@/content/speaking";
import { buildHistoryView, parseHistoryQuery } from "@/features/history/view-model";
import { practiseNext, type TaskInfo } from "@/features/dashboard/progress";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { speakingAttempts, speakingTasks, users } from "@/server/db/schema";
import { setEvaluationModelForTesting, type EvaluationModel } from "@/server/evaluation";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTranscriptionProviderForTesting } from "@/server/transcription";
import { FIXTURE_TRANSCRIPT, fakeWebm, makeModelOutput } from "../../../test/fixtures";
import { ensureTaskSnapshot } from "./attempt-repository";
import { processAttempt } from "./attempt-processing";
import { createAttempt, listAttemptHistory, listAttemptSummaries } from "./attempt-service";

/**
 * "Advice from someone" went from v2 to v3 when its picture's licence changed. Attempts store the version they were
 * made against, but History, the brief's "Your attempts", Practise next and retry all identify a task by its id, so a
 * v2 attempt and a v3 attempt are the same task. This proves it end to end on a real (in-memory) database.
 */
const TASK = getSpeakingTask("b2-part2-advice-from-someone")!;
const USER = "11111111-1111-4111-8111-111111111111";

let db: Db;
let storageDir: string;

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  await db.insert(users).values({ id: USER }).run();
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-audio-"));
  setAudioStorageForTesting(new LocalAudioStorage(storageDir));
  setTranscriptionProviderForTesting({ name: "fake-stt", model: "fake-stt-1", transcribe: vi.fn(async () => ({ text: FIXTURE_TRANSCRIPT, language: "en" })) });
  const model: EvaluationModel = {
    provider: "fake-llm",
    model: "fake-llm-1",
    isDevelopmentProvider: false,
    config: { effort: "high" },
    evaluate: vi.fn(async () => ({ output: makeModelOutput(), provider: "fake-llm", model: "fake-llm-1", inputTokens: 1, outputTokens: 1 })),
  };
  setEvaluationModelForTesting(model);
});

afterEach(() => {
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  setTranscriptionProviderForTesting(undefined);
  setEvaluationModelForTesting(undefined);
  fs.rmSync(storageDir, { recursive: true, force: true });
});

const submit = (previousAttemptId: string | null) =>
  createAttempt({ userId: USER, taskId: TASK.id, audio: fakeWebm(), mimeType: "audio/webm;codecs=opus", durationMs: 95_000, previousAttemptId });

/** An attempt as it was stored before the bump: made against the v2 snapshot (CC0 licence). */
async function storedV2Attempt(): Promise<string> {
  const v2 = { ...TASK, version: 2, picture: { ...TASK.picture!, licence: "CC0 1.0", licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/" } };
  await ensureTaskSnapshot(v2);
  const attempt = await submit(null);
  await processAttempt(attempt.id);
  await db.update(speakingAttempts).set({ taskVersion: 2 }).where(eq(speakingAttempts.id, attempt.id)).run();
  return attempt.id;
}

describe("Advice from someone v2 and v3 are one task", () => {
  it("is now version 3", () => {
    expect(TASK.version).toBe(3);
  });

  it("a v3 retry of a v2 attempt is accepted, with the v2 attempt's goal; History, Your attempts and Practise next see one task", async () => {
    const oldId = await storedV2Attempt();

    // Retry: accepted (same task id), carries the goal from the v2 attempt, stored against v3.
    const retry = await submit(oldId);
    expect(retry.previousAttemptId).toBe(oldId);
    expect(retry.retryFocus?.length).toBeGreaterThan(0);
    await processAttempt(retry.id);

    const rows = await db.select({ id: speakingAttempts.id, v: speakingAttempts.taskVersion }).from(speakingAttempts).all();
    expect(Object.fromEntries(rows.map((r) => [r.id, r.v]))).toEqual({ [oldId]: 2, [retry.id]: 3 });
    expect((await db.select().from(speakingTasks).all()).map((t) => t.version).sort()).toEqual([2, 3]);

    // History: both rows, same task id and title, the newer one shown as a retry of the older.
    const history = await listAttemptHistory(USER);
    expect(history.map((a) => [a.id, a.taskId, a.title])).toEqual([
      [retry.id, TASK.id, "Advice from someone"],
      [oldId, TASK.id, "Advice from someone"],
    ]);
    const view = buildHistoryView(history, parseHistoryQuery({ part: "2" }));
    expect(view.rows).toHaveLength(2);
    expect(view.rows[0]).toMatchObject({ title: "Advice from someone", partLabel: "Part 2" });
    expect(view.rows[0].retry).toBeTruthy();

    // The brief's "Your attempts": both versions.
    expect((await listAttemptSummaries(USER, TASK.id)).map((a) => a.id).sort()).toEqual([oldId, retry.id].sort());

    // Practise next: Advice from someone counts as practised (by either version), so the next task is suggested.
    const tasks: TaskInfo[] = listSpeakingTasks().map(({ id, title, part, level, preparationSeconds, speakingSeconds }) => ({ id, title, part, level, preparationSeconds, speakingSeconds }));
    const onlyOld = history.filter((a) => a.id === oldId);
    expect(practiseNext(onlyOld, tasks)).toMatchObject({ title: "An important decision", reason: "Not practised yet" });
  });
});

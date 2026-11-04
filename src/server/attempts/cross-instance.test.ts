import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { setEvaluationModelForTesting, type EvaluationModel } from "@/server/evaluation";
import { setAudioStorageForTesting } from "@/server/storage";
import { DatabaseAudioStorage } from "@/server/storage/database-audio-storage";
import { setTranscriptionProviderForTesting } from "@/server/transcription";
import { FIXTURE_TRANSCRIPT, fakeWebm, makeEvaluation } from "../../../test/fixtures";
import { claimAttempt, processAttempt } from "./attempt-processing";
import { createAttempt, getAttemptViewForUser, getRecordingAudio } from "./attempt-service";

/**
 * Two "function instances" are two separate connections to one shared database file, with recordings stored in that
 * database (no shared directory, no shared memory). This is the property the hosted setup depends on: whatever one
 * instance writes, another sees on the next request. Each helper switches the process-wide connection to the instance
 * that is "serving" the request.
 */
const TASK_ID = "b2-part2-advice-from-someone";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

let dir: string;
let a: Db;
let b: Db;
const serve = (db: Db) => {
  setDbForTesting(db);
  setAudioStorageForTesting(new DatabaseAudioStorage()); // reads the connection of the serving instance
};

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-instances-"));
  a = await openDatabase(path.join(dir, "shared.db"));
  b = await openDatabase(path.join(dir, "shared.db"));
  await a.insert(users).values([{ id: USER }, { id: OTHER }]).run();
  setTranscriptionProviderForTesting({ name: "fake-stt", model: "fake-stt-1", transcribe: vi.fn(async () => ({ text: FIXTURE_TRANSCRIPT, language: "en" })) });
  const model: EvaluationModel = {
    provider: "fake-llm",
    model: "fake-llm-1",
    isDevelopmentProvider: false,
    config: {},
    evaluate: vi.fn(async () => ({ output: makeEvaluation(), provider: "fake-llm", model: "fake-llm-1", inputTokens: 1, outputTokens: 1 })),
  };
  setEvaluationModelForTesting(model);
});

afterEach(() => {
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  setTranscriptionProviderForTesting(undefined);
  setEvaluationModelForTesting(undefined);
  a.$client.close();
  b.$client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const submit = (userId = USER, previousAttemptId: string | null = null) =>
  createAttempt({ userId, taskId: TASK_ID, audio: fakeWebm(), mimeType: "audio/webm", durationMs: 60_000, previousAttemptId });

describe("two instances sharing one database", () => {
  it("an attempt and recording created on one instance are read, played back and processed on another", async () => {
    serve(a);
    const created = await submit();

    serve(b);
    expect(await getAttemptViewForUser(USER, created.id)).toMatchObject({ id: created.id, status: "uploaded" });
    const audio = await getRecordingAudio(USER, created.id);
    expect(audio.data.equals(fakeWebm())).toBe(true);
    await processAttempt(created.id);

    serve(a);
    const view = await getAttemptViewForUser(USER, created.id);
    expect(view.status).toBe("completed");
    expect(view.transcript?.text).toBe(FIXTURE_TRANSCRIPT);
    expect(view.evaluation).toBeTruthy();
  });

  it("ownership is enforced the same way on every instance: a foreign or missing attempt is a 404", async () => {
    serve(a);
    const created = await submit();
    serve(b);
    await expect(getAttemptViewForUser(OTHER, created.id)).rejects.toMatchObject({ status: 404, code: "attempt_not_found" });
    await expect(getRecordingAudio(OTHER, created.id)).rejects.toMatchObject({ status: 404 });
    await expect(getAttemptViewForUser(USER, "99999999-9999-4999-8999-999999999999")).rejects.toMatchObject({ status: 404, code: "attempt_not_found" });
  });

  it("a claim is won by exactly one of several simultaneous callers", async () => {
    serve(a);
    const created = await submit();
    const results = await Promise.all(Array.from({ length: 6 }, () => claimAttempt(created.id)));
    expect(results.filter(Boolean)).toHaveLength(1);
    serve(b);
    expect(await claimAttempt(created.id)).toBe(false); // already claimed, seen from the other instance
  });

  it("attempt numbers stay unique and consecutive when submissions alternate between instances", async () => {
    serve(a);
    // Numbers are allocated inside one transaction; interleave submissions from both instances.
    const numbers: number[] = [];
    for (let i = 0; i < 4; i++) {
      serve(i % 2 === 0 ? a : b);
      const created = await submit();
      numbers.push(created.attemptNumber);
      await processAttempt(created.id); // finished attempts do not count against the in-progress limit
    }
    expect(numbers).toEqual([1, 2, 3, 4]);
  });
});

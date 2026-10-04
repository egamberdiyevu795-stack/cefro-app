import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ffmpegSpeechGuard, isFfmpegAvailable, setSpeechGuardForTesting } from "@/server/audio/speech-guard";
import { openDatabase, setDbForTesting, type Db } from "@/server/db/client";
import { analyticsEvents, evaluations, recordings, transcripts, users } from "@/server/db/schema";
import { ProviderError } from "@/server/errors";
import { setEvaluationModelForTesting, type EvaluationModel } from "@/server/evaluation";
import { setAudioStorageForTesting } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";
import { setTranscriptionProviderForTesting, type TranscriptionProvider } from "@/server/transcription";
import { FIXTURE_TRANSCRIPT, makeEvaluation } from "../../../test/fixtures";
import { processAttempt } from "./attempt-processing";
import { createAttempt, getAttemptViewForUser } from "./attempt-service";

/**
 * The regression this guard exists for: silent audio must NEVER reach the transcription provider (a model can invent
 * an answer for silence), and so must never be evaluated. These run the real pipeline (storage, attempt service,
 * processing) with a real decoder and spy providers, and assert on the calls.
 */
const ffmpeg = isFfmpegAvailable();
if (!ffmpeg && process.env.REQUIRE_FFMPEG === "1") throw new Error("ffmpeg is required for the speech guard tests (REQUIRE_FFMPEG=1)");

const TASK_ID = "b2-part2-technology-young-people";
const USER = "11111111-1111-4111-8111-111111111111";
const DIR = path.join(process.cwd(), "test", "audio-fixtures", "speech-guard");

let db: Db;
let storageDir: string;
let transcription: TranscriptionProvider & { transcribe: ReturnType<typeof vi.fn> };
let evaluation: EvaluationModel & { evaluate: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  db = await openDatabase(":memory:");
  setDbForTesting(db);
  await db.insert(users).values({ id: USER }).run();
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "cefro-guard-audio-"));
  setAudioStorageForTesting(new LocalAudioStorage(storageDir));
  transcription = { name: "spy-stt", model: "spy-1", transcribe: vi.fn(async () => ({ text: FIXTURE_TRANSCRIPT, language: "en" })) };
  evaluation = {
    provider: "spy-llm",
    model: "spy-llm-1",
    isDevelopmentProvider: false,
    config: {},
    evaluate: vi.fn(async () => ({ output: makeEvaluation(), provider: "spy-llm", model: "spy-llm-1", inputTokens: 1, outputTokens: 1 })),
  };
  setTranscriptionProviderForTesting(transcription);
  setEvaluationModelForTesting(evaluation);
  setSpeechGuardForTesting(ffmpegSpeechGuard);
});

afterEach(async () => {
  setSpeechGuardForTesting(undefined);
  setDbForTesting(undefined);
  setAudioStorageForTesting(undefined);
  setTranscriptionProviderForTesting(undefined);
  setEvaluationModelForTesting(undefined);
  fs.rmSync(storageDir, { recursive: true, force: true });
});

async function submitFixture(file: string, mimeType = "audio/webm;codecs=opus") {
  const created = await createAttempt({ userId: USER, taskId: TASK_ID, audio: fs.readFileSync(path.join(DIR, file)), mimeType, durationMs: 8_000, previousAttemptId: null });
  await processAttempt(created.id);
  return created.id;
}

describe.skipIf(!ffmpeg)("speech activity guard in the attempt pipeline", () => {
  it.each([
    ["silence.webm", "silence"],
    ["nearsil.webm", "near-silence"],
    ["quietroom.webm", "quiet room noise"],
    ["fan.webm", "loud steady noise"],
  ])("%s (%s) never reaches the transcription provider or the evaluator", async (file) => {
    const id = await submitFixture(file);

    expect(transcription.transcribe).not.toHaveBeenCalled();
    expect(evaluation.evaluate).not.toHaveBeenCalled();

    const view = await getAttemptViewForUser(USER, id);
    expect(view.status).toBe("failed");
    expect(view.failure).toEqual({ stage: "transcription", code: "transcription_empty" }); // the existing "not enough speech" semantics
    expect(view.transcript).toBeNull(); // no fabricated transcript
    expect(await db.select().from(transcripts).all()).toHaveLength(0);
    expect(await db.select().from(evaluations).all()).toHaveLength(0);
    expect(await db.select().from(recordings).where(eq(recordings.attemptId, id)).all()).toHaveLength(1); // the audio is kept

    const events = await db.select().from(analyticsEvents).where(eq(analyticsEvents.attemptId, id)).all();
    const blocked = events.find((e) => e.name === "speech_guard_blocked");
    expect(blocked?.properties).toMatchObject({ provider: "spy-stt" });
    expect(events.map((e) => e.name)).not.toContain("transcription_completed");
  });

  it("silence in an Ogg and an MP4 container is blocked as well", async () => {
    await submitFixture("nearsil.ogg", "audio/ogg");
    await submitFixture("silence.m4a", "audio/mp4");
    expect(transcription.transcribe).not.toHaveBeenCalled();
    expect(evaluation.evaluate).not.toHaveBeenCalled();
  });

  it.each([
    ["normal.webm", "normal speech"],
    ["short.webm", "very short speech"],
    ["hes.webm", "speech with hesitation"],
    ["errors.webm", "speech with learner mistakes"],
    ["longpause.webm", "speech with a long pause"],
    ["leadsil.webm", "speech after 5 s of silence"],
    ["trailsil.webm", "speech followed by 5 s of silence"],
    ["multipause.webm", "speech with several pauses"],
    ["quiet40.webm", "very quiet speech"],
    ["snr_noise.webm", "speech over background noise"],
  ])("%s (%s) reaches the transcription provider exactly once, with the original audio", async (file) => {
    const original = fs.readFileSync(path.join(DIR, file));
    const id = await submitFixture(file);

    expect(transcription.transcribe).toHaveBeenCalledTimes(1);
    const input = transcription.transcribe.mock.calls[0][0] as { audio: Buffer; mimeType: string };
    expect(input.audio.equals(original)).toBe(true); // the guard analyses a copy; the provider gets the recording untouched
    expect(input.mimeType).toBe("audio/webm"); // as stored by the attempt service
    expect((await getAttemptViewForUser(USER, id)).status).toBe("completed");
    expect(evaluation.evaluate).toHaveBeenCalledTimes(1);
  });

  it("does not run again when only evaluation failed: the saved transcript is reused and nothing is re-decoded", async () => {
    evaluation.evaluate.mockRejectedValueOnce(new ProviderError("provider_timeout", "slow"));
    const spy = vi.fn(ffmpegSpeechGuard.check);
    setSpeechGuardForTesting({ check: spy });
    const id = await submitFixture("normal.webm");
    expect((await getAttemptViewForUser(USER, id)).failure?.stage).toBe("evaluation");
    expect(spy).toHaveBeenCalledTimes(1);
    await processAttempt(id);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(transcription.transcribe).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the guard cannot run: the provider is not called and the failure is the 'service unavailable' one", async () => {
    setSpeechGuardForTesting({
      check: async () => {
        throw new ProviderError("provider_not_configured", "ffmpeg is not installed", { retryable: false });
      },
    });
    const id = await submitFixture("normal.webm");
    expect(transcription.transcribe).not.toHaveBeenCalled();
    expect((await getAttemptViewForUser(USER, id)).failure).toEqual({ stage: "transcription", code: "provider_not_configured" });
  });

  it("switched off (the development mock), the provider is called as before", async () => {
    setSpeechGuardForTesting(null);
    await submitFixture("silence.webm");
    expect(transcription.transcribe).toHaveBeenCalledTimes(1);
  });
});

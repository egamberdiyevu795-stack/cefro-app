import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProviderError } from "@/server/errors";
import { ffmpegSpeechGuard, isFfmpegAvailable } from "./speech-guard";

/**
 * The guard against real (synthetic) audio files: decoded by ffmpeg from the container the browser produces, then
 * analysed. See test/audio-fixtures/speech-guard/README.md for what the files are: espeak-ng speech and ffmpeg-generated
 * noise, NOT recordings of a person.
 *
 * ffmpeg is a requirement of the guard. CI installs it; on a machine without it these tests are skipped locally, but
 * REQUIRE_FFMPEG=1 (set in CI) turns a missing ffmpeg into a failure instead of a silent skip.
 */
const ffmpeg = isFfmpegAvailable();
if (!ffmpeg && process.env.REQUIRE_FFMPEG === "1") throw new Error("ffmpeg is required for the speech guard tests (REQUIRE_FFMPEG=1)");

const DIR = path.join(process.cwd(), "test", "audio-fixtures", "speech-guard");
const load = (file: string) => fs.readFileSync(path.join(DIR, file));
const MIME: Record<string, string> = { webm: "audio/webm;codecs=opus", m4a: "audio/mp4", ogg: "audio/ogg" };
const check = (file: string) => ffmpegSpeechGuard.check({ audio: load(file), mimeType: MIME[file.split(".").pop()!] });

/** [file, what it is, expected: allowed to reach transcription?] */
const MATRIX: [string, string, boolean][] = [
  ["silence.webm", "8 s of digital silence", false],
  ["nearsil.webm", "8 s of very quiet noise (open microphone, about -66 dBFS)", false],
  ["quietroom.webm", "8 s of quiet room noise", false],
  ["fan.webm", "8 s of loud steady noise", false],
  ["hum.webm", "8 s of a loud steady 50 Hz hum", false],
  ["wander.webm", "8 s of noise whose level drifts slowly", false],
  ["click.webm", "one click in 8 s", false],
  ["clicktrain.webm", "a train of taps", false],
  ["keyboard.webm", "keyboard-like bursts", false],
  ["cough.webm", "a cough-length burst", false],
  ["normal.webm", "normal speech (14 s)", true],
  ["short.webm", "very short speech (\"I like phones\")", true],
  ["hes.webm", "speech with hesitation sounds (um, uh, er)", true],
  ["errors.webm", "speech with deliberate learner mistakes", true],
  ["longpause.webm", "speech, a 5 s pause, speech", true],
  ["leadsil.webm", "5 s of silence, then speech", true],
  ["trailsil.webm", "speech, then 5 s of silence", true],
  ["leadtrail.webm", "5 s silence, a 1 s answer, 5 s silence", true],
  ["multipause.webm", "speech with several 1 s pauses", true],
  ["quiet30.webm", "speech 30 dB quieter than normal", true],
  ["quiet40.webm", "speech 40 dB quieter than normal", true],
  ["snr_noise.webm", "speech over steady background noise", true],
  ["snr_loud.webm", "speech over loud steady background noise", true],
  ["normal.m4a", "normal speech, MP4/AAC container", true],
  ["normal.ogg", "normal speech, Ogg/Opus container", true],
  ["silence.m4a", "silence, MP4/AAC container", false],
  ["nearsil.ogg", "near-silence, Ogg/Opus container", false],
];

describe.skipIf(!ffmpeg)("speech activity guard on audio files", () => {
  it.each(MATRIX)("%s (%s): reaches transcription = %s", async (file, _what, allowed) => {
    const result = await check(file);
    expect(result.hasSpeech, `${file}: ${result.reason}, ${result.activeSeconds.toFixed(2)} s active, floor ${result.noiseFloorDb.toFixed(0)} dB`).toBe(allowed);
  });

  it("reports the reason and the measurements, for the log and the analytics event", async () => {
    const silent = await check("silence.webm");
    expect(silent).toMatchObject({ hasSpeech: false, reason: "silence", activeSeconds: 0 });
    const speech = await check("normal.webm");
    expect(speech).toMatchObject({ hasSpeech: true, reason: "speech" });
    expect(speech.durationSeconds).toBeGreaterThan(13);
    expect(speech.activeSeconds).toBeGreaterThan(8);
  });

  it("rejects bytes that are not audio as unsupported audio, not as silence", async () => {
    const error = await ffmpegSpeechGuard.check({ audio: Buffer.from("this is not audio at all, just text"), mimeType: "audio/webm" }).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ failureCode: "audio_unsupported", retryable: false });
  });

  it("adds little time to an attempt: decoding plus analysis of a 14 s recording", async () => {
    await check("normal.webm"); // warm-up
    const started = performance.now();
    const result = await check("normal.webm");
    const total = performance.now() - started;
    console.log(`speech guard: 14 s recording, decode ${result.decodeMs} ms + analysis ${result.analyseMs} ms (total ${total.toFixed(0)} ms)`);
    expect(total).toBeLessThan(3000);
  });
});

import "server-only";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import ffmpegStatic from "ffmpeg-static";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeSpeechActivity, type SpeechActivity } from "@/domain/audio/speech-activity";
import { getEnv } from "@/server/config/env";
import { ProviderError } from "@/server/errors";

/**
 * Speech Activity Guard: decides, from the audio signal itself, whether a recording contains enough speech to be
 * worth sending to a transcription provider. It runs BEFORE any provider is called, so it is the same for Gemini,
 * OpenAI or any later provider, and no model is asked to make the decision (see domain/audio/speech-activity.ts for
 * why and for the method).
 *
 * Decoding uses ffmpeg (every container the app accepts: WebM/Opus from Chrome and Firefox, MP4/AAC from Safari,
 * Ogg, WAV, MP3) into 16 kHz mono PCM, which is a few milliseconds of analysis per recording.
 */
const ANALYSIS_RATE = 16_000;
/** Longer recordings are analysed up to this point only (the task limits answers to a couple of minutes). */
const MAX_ANALYSED_SECONDS = 600;
const DECODE_TIMEOUT_MS = 30_000;

export type SpeechGuardResult = SpeechActivity & { decodeMs: number; analyseMs: number };

export interface SpeechGuard {
  check(input: { audio: Buffer; mimeType: string }): Promise<SpeechGuardResult>;
}

/**
 * Which ffmpeg to run: FFMPEG_PATH when set (taken literally, so a wrong path is reported as such); otherwise the ffmpeg
 * on PATH when there is one; otherwise the static binary shipped by the `ffmpeg-static` package, which is what makes the
 * guard work on hosts without ffmpeg installed (Vercel functions have none).
 */
export function resolveFfmpegCommand(explicit?: string): string {
  if (explicit) return explicit;
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0) return "ffmpeg";
  return typeof ffmpegStatic === "string" && fs.existsSync(ffmpegStatic) ? ffmpegStatic : "ffmpeg";
}

// The lookup spawns a process, so remember the answer for as long as PATH is unchanged.
let resolvedDefault: { path: string | undefined; command: string } | undefined;

export function ffmpegCommand(): string {
  const explicit = getEnv().FFMPEG_PATH;
  if (explicit) return explicit;
  if (resolvedDefault?.path !== process.env.PATH) resolvedDefault = { path: process.env.PATH, command: resolveFfmpegCommand() };
  return resolvedDefault!.command;
}

export function isFfmpegAvailable(explicit?: string): boolean {
  return spawnSync(/* turbopackIgnore: true */ resolveFfmpegCommand(explicit), ["-version"], { stdio: "ignore" }).status === 0;
}

/** Whether the guard runs for this configuration: "auto" = on for real transcription providers, off for the mock. */
export function isSpeechGuardEnabled(env = getEnv()): boolean {
  if (env.SPEECH_GUARD === "on") return true;
  if (env.SPEECH_GUARD === "off") return false;
  return env.TRANSCRIPTION_PROVIDER !== "mock";
}

async function decodeToPcm(audio: Buffer): Promise<Int16Array> {
  const command = ffmpegCommand();
  // A temporary file (not a pipe) because some MP4 files need to seek; removed in every case.
  const file = path.join(os.tmpdir(), `cefro-guard-${process.pid}-${crypto.randomUUID()}`);
  fs.writeFileSync(file, audio, { mode: 0o600 });
  try {
    return await new Promise<Int16Array>((resolve, reject) => {
      // The command is only known at run time; the marker stops the bundler from tracing the whole project for it.
      const child = spawn(
        /* turbopackIgnore: true */ command,
        ["-v", "error", "-nostdin", "-i", file, "-vn", "-t", String(MAX_ANALYSED_SECONDS), "-ac", "1", "-ar", String(ANALYSIS_RATE), "-f", "s16le", "pipe:1"],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const chunks: Buffer[] = [];
      let bytes = 0;
      let stderr = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), DECODE_TIMEOUT_MS);
      child.stdout.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        chunks.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < 2000) stderr += chunk.toString();
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(
          error.code === "ENOENT"
            ? new ProviderError("provider_not_configured", "ffmpeg is not installed, so the speech activity guard cannot run", { retryable: false })
            : new ProviderError("audio_unsupported", "Could not start the audio decoder", { cause: error, retryable: false }),
        );
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 || bytes === 0) {
          reject(new ProviderError("audio_unsupported", `Recording could not be decoded (${stderr.trim().split("\n")[0] || `exit ${code}`})`, { retryable: false }));
          return;
        }
        const all = Buffer.concat(chunks, bytes);
        const samples = new Int16Array(Math.floor(all.length / 2));
        for (let i = 0; i < samples.length; i++) samples[i] = all.readInt16LE(i * 2);
        resolve(samples);
      });
    });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

export const ffmpegSpeechGuard: SpeechGuard = {
  async check({ audio }) {
    const decodeStarted = performance.now();
    const pcm = await decodeToPcm(audio);
    const analyseStarted = performance.now();
    const samples = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768;
    const activity = analyzeSpeechActivity(samples, ANALYSIS_RATE);
    return { ...activity, decodeMs: Math.round(analyseStarted - decodeStarted), analyseMs: Math.round(performance.now() - analyseStarted) };
  },
};

let override: SpeechGuard | null | undefined;

/** The guard to use, or null when it is switched off for this configuration. */
export function getSpeechGuard(): SpeechGuard | null {
  if (override !== undefined) return override;
  return isSpeechGuardEnabled() ? ffmpegSpeechGuard : null;
}

/** Test seam: pass a guard, `null` (guard off) or `undefined` (back to the real configuration). */
export function setSpeechGuardForTesting(guard: SpeechGuard | null | undefined): void {
  override = guard;
}

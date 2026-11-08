#!/usr/bin/env node
/**
 * Makes the Part 1 question audio and the Part 3 topic introductions (docs/part1-plan.md §1, decision 16): pre-generated text-to-speech, one clear neutral
 * English voice for every task, stored with the content. Nothing calls a speech API at practice time.
 *
 * The texts, file paths, voice and settings live in src/content/speaking/part1/question-audio.json (and, for Part 3,
 * src/content/speaking/c1/part3-intro-audio.json, which must use the same voice block). A unit test checks
 * that every Part 1 question's text and audio path match that file, so changing a question's wording fails the tests
 * until its audio is made again with this script (same voice, same settings).
 *
 * One-time setup (offline afterwards; nothing here is needed by the app):
 *   python3 -m venv .venv-tts && .venv-tts/bin/pip install piper-tts
 *   curl -L -o voice.tgz https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-en-us-libritts-high.tar.gz
 *   tar xzf voice.tgz            # gives en-us-libritts-high.onnx and .onnx.json (keep them out of git: 136 MB)
 *
 * Then:
 *   PIPER_BIN=.venv-tts/bin/piper PIPER_MODEL=en-us-libritts-high.onnx node scripts/make-part1-question-audio.mjs
 *
 * Add ONLY=b1-part1-2-shopping/v1/intro to remake only the files whose path contains that text.
 *
 * Needs ffmpeg on the PATH. Output: 22,050 Hz mono 16-bit WAV, which every browser plays without a codec.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
// Part 1 questions and introductions, then the Part 3 topic introductions: one voice and one set of settings for both.
const MANIFESTS = ["src/content/speaking/part1/question-audio.json", "src/content/speaking/c1/part3-intro-audio.json"];
const manifests = MANIFESTS.map((file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")));
const manifest = manifests[0];
for (const other of manifests.slice(1)) {
  if (JSON.stringify(other.voice) !== JSON.stringify(manifest.voice)) {
    console.error("Every manifest must use the same voice and settings as Part 1 (question-audio.json).");
    process.exit(1);
  }
}
const bin = process.env.PIPER_BIN ?? "piper";
const model = process.env.PIPER_MODEL;
if (!model) {
  console.error("Set PIPER_MODEL to the path of en-us-libritts-high.onnx (see the comment at the top of this script).");
  process.exit(1);
}
const v = manifest.voice;
// ONLY=<part of a path> regenerates just the matching files (Piper is not deterministic: unchanged files stay as they are).
const only = process.env.ONLY;
for (const file of manifests.flatMap((m) => m.files).filter((f) => !only || f.path.includes(only))) {
  const out = path.join(ROOT, "public", file.path);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync(
    bin,
    [
      "-m", model,
      "-s", String(v.speakerIndex),
      "--length-scale", String(v.lengthScale),
      "--noise-scale", String(v.noiseScale),
      "--noise-w-scale", String(v.noiseW),
      "--sentence-silence", String(v.sentenceSilence),
      "-f", `${out}.raw.wav`,
    ],
    { input: file.text, stdio: ["pipe", "ignore", "inherit"] },
  );
  // This voice speaks fast for B1 learners and Piper's length scale barely changes it: slow it down without changing
  // the pitch (ffmpeg's atempo), and add a short silence at the start so the first word is never clipped.
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-y", "-i", `${out}.raw.wav`, "-af", `adelay=150,atempo=${v.tempo}`, "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le", out],
    { stdio: "inherit" },
  );
  fs.rmSync(`${out}.raw.wav`);
  console.log(`${file.path}  ${file.text}`);
}

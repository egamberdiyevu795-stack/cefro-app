#!/usr/bin/env node
/**
 * Writes the PLACEHOLDER question audio and chime for the Part 1 question player (docs/part1-plan.md §1).
 *
 * These are synthetic tones, not speech: they stand in for the pre-generated text-to-speech files (decision 16) until
 * the real voice files are made. Each question file is a short two-tone pattern; the chime is one bright tone with a
 * fade. Mono 16-bit PCM WAV at 16 kHz, so every browser can play them without a codec.
 *
 *   node scripts/make-part1-placeholder-audio.mjs
 */
import fs from "node:fs";
import path from "node:path";

const RATE = 16_000;
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "public", "audio", "speaking", "part1", "placeholder");

/** Sum of segments: [frequency Hz (0 = silence), seconds]. Each tone gets a short fade in/out to avoid clicks. */
function render(segments, gain = 0.25) {
  const samples = [];
  for (const [freq, seconds] of segments) {
    const n = Math.round(seconds * RATE);
    const fade = Math.min(Math.round(0.02 * RATE), Math.floor(n / 2));
    for (let i = 0; i < n; i++) {
      const env = freq === 0 ? 0 : Math.min(1, i / fade, (n - 1 - i) / fade);
      samples.push(freq === 0 ? 0 : Math.sin((2 * Math.PI * freq * i) / RATE) * gain * env);
    }
  }
  return samples;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

fs.mkdirSync(OUT, { recursive: true });
// One file per question so each task's content points at its own file, as the real TTS files will.
const QUESTION_PATTERN = [[392, 0.35], [0, 0.1], [523, 0.35], [0, 0.2]];
for (const name of ["part1-1-q1", "part1-1-q2", "part1-1-q3", "part1-2-q4", "part1-2-q5", "part1-2-q6"]) {
  fs.writeFileSync(path.join(OUT, `${name}.wav`), wav(render(QUESTION_PATTERN)));
}
fs.writeFileSync(path.join(OUT, "chime.wav"), wav(render([[1047, 0.4]], 0.2)));
console.log(`Wrote placeholder audio to ${OUT}`);

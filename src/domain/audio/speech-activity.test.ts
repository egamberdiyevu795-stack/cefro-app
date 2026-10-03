import { describe, expect, it } from "vitest";
import { analyzeSpeechActivity } from "./speech-activity";

const RATE = 16_000;

/** Deterministic pseudo-random noise in [-1, 1] (no Math.random: tests must be repeatable). */
function noise(seconds: number, amplitude: number, seed = 1): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  let x = seed;
  for (let i = 0; i < out.length; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    out[i] = ((x / 0xffffffff) * 2 - 1) * amplitude;
  }
  return out;
}

/** A "voiced" stretch: a 150 Hz tone whose level rises and falls at a syllable rate (4 Hz), like speech energy. */
function voiced(seconds: number, amplitude = 0.3): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const envelope = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t);
    out[i] = amplitude * envelope * Math.sin(2 * Math.PI * 150 * t);
  }
  return out;
}

const silence = (seconds: number) => new Float32Array(Math.round(seconds * RATE));
const join = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const mix = (a: Float32Array, b: Float32Array) => a.map((v, i) => v + (b[i] ?? 0));

describe("analyzeSpeechActivity", () => {
  it("blocks digital silence and says why", () => {
    const result = analyzeSpeechActivity(silence(8), RATE);
    expect(result).toMatchObject({ hasSpeech: false, reason: "silence", activeSeconds: 0 });
  });

  it("blocks very quiet noise, however it is shaped", () => {
    expect(analyzeSpeechActivity(noise(8, 0.002), RATE).hasSpeech).toBe(false);
    expect(analyzeSpeechActivity(noise(8, 0.0005, 7), RATE).hasSpeech).toBe(false);
  });

  it("blocks steady noise even when it is loud, because it never rises above its own floor", () => {
    const loud = analyzeSpeechActivity(noise(8, 0.3), RATE);
    expect(loud.hasSpeech).toBe(false);
    expect(loud.reason).toBe("no_activity");
  });

  it("accepts speech-like energy", () => {
    const result = analyzeSpeechActivity(voiced(4), RATE);
    expect(result.hasSpeech).toBe(true);
    expect(result.activeSeconds).toBeGreaterThan(1.5);
  });

  it("is not fooled by silence before and after the speech, nor by a long pause in the middle", () => {
    const pauses = join(silence(6), voiced(2), silence(5), voiced(2), silence(6));
    const result = analyzeSpeechActivity(pauses, RATE);
    expect(result.hasSpeech).toBe(true);
    expect(result.segments).toBe(2);
    expect(result.activeRatio).toBeLessThan(0.3); // mostly silence, still speech
  });

  it("accepts quiet speech over a realistic room-noise floor, and blocks the same room without the speech", () => {
    const room = noise(10, 0.0008, 3);
    const quietSpeech = mix(join(silence(3), voiced(3, 0.01), silence(4)), room);
    expect(analyzeSpeechActivity(quietSpeech, RATE).hasSpeech).toBe(true);
    expect(analyzeSpeechActivity(room, RATE).hasSpeech).toBe(false);
  });

  it("accepts speech over steady background noise when it is clearly louder than the noise", () => {
    const hiss = noise(10, 0.02, 5);
    expect(analyzeSpeechActivity(mix(join(silence(2), voiced(4, 0.3), silence(4)), hiss), RATE).hasSpeech).toBe(true);
  });

  it("does not count a single click, a cough-length burst or a tap train as speech", () => {
    const click = join(silence(3), noise(0.1, 0.5), silence(5));
    const cough = join(silence(3), noise(0.4, 0.5, 9), silence(4.6));
    const taps = join(...Array.from({ length: 12 }, () => join(noise(0.1, 0.5, 11), silence(0.4))));
    for (const clip of [click, cough, taps]) expect(analyzeSpeechActivity(clip, RATE).hasSpeech).toBe(false);
  });

  it("treats a recording that is only a few frames long as too short", () => {
    expect(analyzeSpeechActivity(voiced(0.05), RATE).reason).toBe("too_short");
  });

  it("is lightweight: a ten-minute recording is analysed in well under a second", () => {
    const long = join(silence(300), voiced(300));
    const started = performance.now();
    analyzeSpeechActivity(long, RATE);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

/**
 * Speech activity analysis on decoded audio. Pure signal processing: no provider, no network, no model.
 *
 * Why it exists: speech-to-text models can INVENT a plausible answer for silent or near-silent audio (measured with
 * Gemini, see docs/AI_EVALUATION_QUALITY.md), and a prompt cannot reliably prevent that. So the decision "is there
 * speech worth transcribing?" is made from the audio signal itself, before any transcription provider is called.
 *
 * Method: split the audio into 20 ms frames and measure the energy (RMS, in dBFS) of each. A frame is "active" when it
 * is both clearly above the recording's own noise floor AND above an absolute level, so that
 *  - steady noise (hiss, fan, room tone) never counts, however loud, because it does not rise above its own floor;
 *  - a very quiet but real voice still counts, because it rises well above a quiet floor;
 *  - pauses, leading and trailing silence are simply inactive frames and do not matter.
 * Short gaps are bridged and tiny blips are dropped; the verdict is based on the total duration of sustained activity.
 *
 * It is an energy-based activity detector, not a speech/non-speech classifier: loud non-speech that varies like speech
 * (music, television, several people) is still "active". See the documented limitations.
 */
export interface SpeechActivityOptions {
  frameMs: number;
  /** An active frame must exceed the noise floor by at least this many dB. */
  marginDb: number;
  /** ... and be at least this loud (dBFS RMS). */
  absoluteFloorDb: number;
  /** Gaps up to this long between active frames are bridged (pauses inside a word or phrase). */
  bridgeGapMs: number;
  /** Active runs shorter than this are discarded (clicks, taps). */
  minRunMs: number;
  /** Total sustained activity needed to justify transcription. */
  minActiveSeconds: number;
  /** At least one continuous stretch (pauses up to bridgeGapMs included) must last this long: a cough or a tap train does not. */
  minLongestRunMs: number;
}

export const DEFAULT_SPEECH_ACTIVITY_OPTIONS: SpeechActivityOptions = {
  frameMs: 20,
  marginDb: 12,
  absoluteFloorDb: -60,
  bridgeGapMs: 200,
  minRunMs: 80,
  // Five words (the pipeline's own minimum for an assessable answer) take about a second of speech, so 0.8 s of
  // activity never rejects an answer that could have been assessed anyway.
  minActiveSeconds: 0.8,
  minLongestRunMs: 500,
};

export interface SpeechActivity {
  hasSpeech: boolean;
  durationSeconds: number;
  /** Total length of sustained activity after bridging and clean-up. */
  activeSeconds: number;
  activeRatio: number;
  segments: number;
  longestSegmentSeconds: number;
  /** 10th-percentile frame level: the recording's noise floor (dBFS). */
  noiseFloorDb: number;
  /** 95th-percentile frame level (dBFS). */
  loudDb: number;
  peakDb: number;
  /** The activity threshold that was applied (dBFS). */
  thresholdDb: number;
  reason: "speech" | "silence" | "no_activity" | "too_little_activity" | "too_short";
}

const SILENCE_DB = -100;

const toDb = (meanSquare: number) => (meanSquare <= 1e-10 ? SILENCE_DB : Math.max(SILENCE_DB, 10 * Math.log10(meanSquare)));

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return SILENCE_DB;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** `samples` are mono PCM in [-1, 1]. */
export function analyzeSpeechActivity(
  samples: Float32Array,
  sampleRate: number,
  overrides: Partial<SpeechActivityOptions> = {},
): SpeechActivity {
  const o = { ...DEFAULT_SPEECH_ACTIVITY_OPTIONS, ...overrides };
  const frameSize = Math.max(1, Math.round((sampleRate * o.frameMs) / 1000));
  const frameCount = Math.floor(samples.length / frameSize);
  const durationSeconds = samples.length / sampleRate;
  const empty = (reason: SpeechActivity["reason"]): SpeechActivity => ({
    hasSpeech: false,
    durationSeconds,
    activeSeconds: 0,
    activeRatio: 0,
    segments: 0,
    longestSegmentSeconds: 0,
    noiseFloorDb: SILENCE_DB,
    loudDb: SILENCE_DB,
    peakDb: SILENCE_DB,
    thresholdDb: SILENCE_DB,
    reason,
  });
  if (frameCount < 5) return empty("too_short");

  const levels: number[] = new Array(frameCount);
  let peak = 0;
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    for (let i = f * frameSize, end = i + frameSize; i < end; i++) {
      const v = samples[i];
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    levels[f] = toDb(sum / frameSize);
  }

  const sorted = [...levels].sort((a, b) => a - b);
  const noiseFloorDb = percentile(sorted, 0.1);
  const loudDb = percentile(sorted, 0.95);
  const peakDb = peak <= 1e-5 ? SILENCE_DB : 20 * Math.log10(peak);
  const thresholdDb = Math.max(o.absoluteFloorDb, noiseFloorDb + o.marginDb);
  const base = { durationSeconds, noiseFloorDb, loudDb, peakDb, thresholdDb };

  if (loudDb <= SILENCE_DB + 1) return { ...empty("silence"), ...base };

  const active = levels.map((l) => l > thresholdDb);

  // Bridge short gaps, then drop short runs.
  const bridgeFrames = Math.round(o.bridgeGapMs / o.frameMs);
  const minRunFrames = Math.max(1, Math.round(o.minRunMs / o.frameMs));
  const runs: [number, number][] = [];
  let start = -1;
  for (let f = 0; f <= frameCount; f++) {
    if (f < frameCount && active[f]) {
      if (start < 0) start = f;
    } else if (start >= 0) {
      runs.push([start, f]);
      start = -1;
    }
  }
  const merged: [number, number][] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run[0] - last[1] <= bridgeFrames) last[1] = run[1];
    else merged.push([...run]);
  }
  // Activity is counted from the original active frames inside each kept run (a bridged gap is not speech time).
  const kept = merged.filter(([s, e]) => e - s >= minRunFrames);
  let activeFrames = 0;
  let longest = 0;
  for (const [s, e] of kept) {
    let n = 0;
    for (let f = s; f < e; f++) if (active[f]) n++;
    activeFrames += n;
    longest = Math.max(longest, (e - s) * o.frameMs);
  }
  const activeSeconds = (activeFrames * o.frameMs) / 1000;
  const hasSpeech = activeSeconds >= o.minActiveSeconds && longest >= o.minLongestRunMs;
  const reason: SpeechActivity["reason"] = hasSpeech ? "speech" : kept.length === 0 ? "no_activity" : "too_little_activity";
  return {
    ...base,
    hasSpeech,
    activeSeconds,
    activeRatio: activeSeconds / durationSeconds,
    segments: kept.length,
    longestSegmentSeconds: longest / 1000,
    reason,
  };
}

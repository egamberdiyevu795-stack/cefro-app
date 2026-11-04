import { describe, expect, it } from "vitest";
import { a2Part11DailyLife } from "@/content/speaking/part1/a2-part1-1-daily-life";
import { b1Part12Shopping } from "@/content/speaking/part1/b1-part1-2-shopping";
import {
  createSequenceState,
  cueFor,
  preparationMs,
  recorderMode,
  sequenceReducer,
  speakingMs,
  speakingTimePerQuestionMs,
  type SequenceAction,
  type SequenceConfig,
  type SequenceState,
} from "./question-sequence-machine";

const part11: SequenceConfig = { questions: a2Part11DailyLife.questions, timeScale: 1 };
const part12: SequenceConfig = { questions: b1Part12Shopping.questions, timeScale: 1 };

function run(state: SequenceState, ...actions: SequenceAction[]): SequenceState {
  return actions.reduce(sequenceReducer, state);
}

/**
 * Drives a whole part the way the player does, with a fake clock: each question audio takes `promptMs`, each chime
 * `chimeMs`, and the student speaks until the countdown ends. Returns the final state and the speaking windows seen.
 */
function playThrough(config: SequenceConfig, options: { promptMs?: number; chimeMs?: number; failPrompt?: number[]; failChime?: number[] } = {}) {
  const { promptMs = 2000, chimeMs = 500, failPrompt = [], failChime = [] } = options;
  let now = 1_000_000;
  let recordingMs = 0;
  let state = run(createSequenceState(config), { type: "start" });
  const windows: { index: number; startedAt: number; endsAt: number }[] = [];
  const stepsSeen: string[] = [];
  while (state.phase.kind === "question") {
    const { index, step } = state.phase;
    stepsSeen.push(`${index}:${step.kind}:${recorderMode(state.phase)}`);
    if (step.kind === "prompt") {
      now += promptMs;
      state = failPrompt.includes(index)
        ? sequenceReducer(state, { type: "promptEnded", index, now, ok: false, reason: "load_error" })
        : sequenceReducer(state, { type: "promptEnded", index, now, ok: true });
    } else if (step.kind === "preparing") {
      now = step.endsAt;
      state = sequenceReducer(state, { type: "preparationExpired", index });
    } else if (step.kind === "chime") {
      now += chimeMs;
      const chime = failChime.includes(index) ? ({ ok: false, reason: "timeout_start" } as const) : ({ ok: true } as const);
      state = sequenceReducer(state, { type: "speakingStarted", index, now, recordingMs, chime });
    } else {
      windows.push({ index, startedAt: step.startedAt, endsAt: step.endsAt });
      recordingMs += step.endsAt - now; // only speaking is recorded
      now = step.endsAt;
      state = sequenceReducer(state, { type: "speakingExpired", index });
    }
  }
  return { state, windows, stepsSeen, recordingMs };
}

describe("timings come from the task content", () => {
  it("Part 1.1: three 30 s speaking windows, no preparation", () => {
    const { windows } = playThrough(part11);
    expect(windows.map((w) => w.endsAt - w.startedAt)).toEqual([30_000, 30_000, 30_000]);
    expect([0, 1, 2].map((i) => preparationMs(part11, i))).toEqual([0, 0, 0]);
  });

  it("Part 1.2: 45 s + 30 s + 30 s, no preparation", () => {
    const { windows } = playThrough(part12);
    expect(windows.map((w) => w.endsAt - w.startedAt)).toEqual([45_000, 30_000, 30_000]);
  });

  it("a different content file gives different timings (nothing is hard-coded)", () => {
    const custom: SequenceConfig = { questions: [{ prepSeconds: 0, speakingSeconds: 12 }, { prepSeconds: 0, speakingSeconds: 7 }], timeScale: 1 };
    expect(playThrough(custom).windows.map((w) => w.endsAt - w.startedAt)).toEqual([12_000, 7_000]);
  });

  it("timeScale shortens every timing (dev page only)", () => {
    const fast = { ...part12, timeScale: 0.05 };
    expect([0, 1, 2].map((i) => speakingMs(fast, i))).toEqual([2250, 1500, 1500]);
  });

  it("rejects invalid configs", () => {
    expect(() => createSequenceState({ questions: [], timeScale: 1 })).toThrow();
    expect(() => createSequenceState({ ...part11, timeScale: 2 })).toThrow();
    expect(() => createSequenceState({ ...part11, timeScale: 0 })).toThrow();
    expect(() => createSequenceState({ questions: [{ prepSeconds: 0, speakingSeconds: 0 }], timeScale: 1 })).toThrow();
  });
});

describe("sequencing", () => {
  it("each question goes prompt → chime → speaking, then the next starts automatically; then finished", () => {
    const { state, stepsSeen } = playThrough(part11);
    expect(stepsSeen).toEqual([
      "0:prompt:paused", "0:chime:paused", "0:speaking:recording",
      "1:prompt:paused", "1:chime:paused", "1:speaking:recording",
      "2:prompt:paused", "2:chime:paused", "2:speaking:recording",
    ]);
    expect(state.phase).toEqual({ kind: "finished" });
  });

  it("the countdown starts when the chime ends, not when the question audio ends", () => {
    let state = run(createSequenceState(part11), { type: "start" }, { type: "promptEnded", index: 0, now: 100, ok: true });
    expect(state.phase).toEqual({ kind: "question", index: 0, step: { kind: "chime" } });
    state = sequenceReducer(state, { type: "speakingStarted", index: 0, now: 700, recordingMs: 0, chime: { ok: true } });
    expect(state.phase).toMatchObject({ step: { kind: "speaking", startedAt: 700, endsAt: 30_700, totalMs: 30_000 } });
  });

  it("is idle before Start, and Start only works once", () => {
    const idle = createSequenceState(part11);
    expect(idle.phase).toEqual({ kind: "idle" });
    expect(recorderMode(idle.phase)).toBe("off");
    expect(cueFor(idle.phase)).toBeNull();
    const started = sequenceReducer(idle, { type: "start" });
    expect(started.phase).toEqual({ kind: "question", index: 0, step: { kind: "prompt" } });
    expect(sequenceReducer(started, { type: "start" })).toBe(started);
  });

  it("asks for the right cue in each step", () => {
    let state = run(createSequenceState(part11), { type: "start" });
    expect(cueFor(state.phase)).toEqual({ index: 0, cue: "question" });
    state = sequenceReducer(state, { type: "promptEnded", index: 0, now: 0, ok: true });
    expect(cueFor(state.phase)).toEqual({ index: 0, cue: "chime" });
    state = sequenceReducer(state, { type: "speakingStarted", index: 0, now: 0, recordingMs: 0, chime: { ok: true } });
    expect(cueFor(state.phase)).toBeNull();
  });

  it("ignores stale and duplicate events", () => {
    const started = run(createSequenceState(part11), { type: "start" });
    // Wrong index, wrong step, and a second "ended" after the step moved on.
    expect(sequenceReducer(started, { type: "promptEnded", index: 1, now: 0, ok: true })).toBe(started);
    expect(sequenceReducer(started, { type: "speakingExpired", index: 0 })).toBe(started);
    expect(sequenceReducer(started, { type: "speakingStarted", index: 0, now: 0, recordingMs: 0, chime: { ok: true } })).toBe(started);
    const chime = sequenceReducer(started, { type: "promptEnded", index: 0, now: 0, ok: true });
    expect(sequenceReducer(chime, { type: "promptEnded", index: 0, now: 0, ok: false, reason: "timeout_end" })).toBe(chime);
  });

  it("supports preparation when a part has it (prepSeconds kept for later parts)", () => {
    const withPrep: SequenceConfig = { questions: [{ prepSeconds: 10, speakingSeconds: 20 }], timeScale: 1 };
    let state = run(createSequenceState(withPrep), { type: "start" }, { type: "promptEnded", index: 0, now: 5000, ok: true });
    expect(state.phase).toEqual({ kind: "question", index: 0, step: { kind: "preparing", endsAt: 15_000, totalMs: 10_000 } });
    expect(recorderMode(state.phase)).toBe("paused");
    state = sequenceReducer(state, { type: "preparationExpired", index: 0 });
    expect(state.phase).toMatchObject({ step: { kind: "chime" } });
  });

  it("a microphone or recorder failure stops the part", () => {
    const started = run(createSequenceState(part11), { type: "start" });
    const failed = sequenceReducer(started, { type: "fail", reason: "microphone_unavailable" });
    expect(failed.phase).toEqual({ kind: "failed", reason: "microphone_unavailable" });
    expect(recorderMode(failed.phase)).toBe("stopped");
    const done = playThrough(part11).state;
    expect(sequenceReducer(done, { type: "fail", reason: "x" })).toBe(done);
  });
});

describe("one recording: offsets in recording time", () => {
  it("offsets are the start of each speaking window with question audio and chimes removed: [0, 30 s, 60 s]", () => {
    const { state, recordingMs } = playThrough(part11, { promptMs: 3000, chimeMs: 800 });
    expect(state.offsetsMs).toEqual([0, 30_000, 60_000]);
    expect(recordingMs).toBe(90_000);
    expect(speakingTimePerQuestionMs(state.offsetsMs, recordingMs)).toEqual([30_000, 30_000, 30_000]);
  });

  it("Part 1.2 offsets: [0, 45 s, 75 s]", () => {
    const { state, recordingMs } = playThrough(part12);
    expect(state.offsetsMs).toEqual([0, 45_000, 75_000]);
    expect(speakingTimePerQuestionMs(state.offsetsMs, recordingMs)).toEqual([45_000, 30_000, 30_000]);
  });

  it("the recorder records only while speaking", () => {
    const { stepsSeen } = playThrough(part12);
    for (const step of stepsSeen) expect(step.endsWith(":recording")).toBe(step.includes(":speaking:"));
  });
});

describe("audio failures never block the part", () => {
  it("a failed question audio: the chime still plays, the countdown still starts, the failure is recorded", () => {
    let state = run(createSequenceState(part11), { type: "start" });
    state = sequenceReducer(state, { type: "promptEnded", index: 0, now: 0, ok: false, reason: "load_error" });
    expect(state.phase).toEqual({ kind: "question", index: 0, step: { kind: "chime" } });
    expect(state.audioFailures).toEqual([{ index: 0, cue: "question", reason: "load_error" }]);
  });

  it("a failed chime: the countdown starts anyway", () => {
    const { state, windows } = playThrough(part11, { failChime: [1] });
    expect(windows).toHaveLength(3);
    expect(state.audioFailures).toEqual([{ index: 1, cue: "chime", reason: "timeout_start" }]);
  });

  it("every audio file failing still completes the part with full timings and offsets", () => {
    const { state, windows } = playThrough(part12, { failPrompt: [0, 1, 2], failChime: [0, 1, 2] });
    expect(state.phase).toEqual({ kind: "finished" });
    expect(windows.map((w) => w.endsAt - w.startedAt)).toEqual([45_000, 30_000, 30_000]);
    expect(state.offsetsMs).toEqual([0, 45_000, 75_000]);
    expect(state.audioFailures).toHaveLength(6);
  });
});

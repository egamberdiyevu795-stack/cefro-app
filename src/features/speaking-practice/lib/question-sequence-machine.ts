/**
 * Question-by-question delivery inside one recording (Multilevel Part 1, docs/part1-plan.md §1).
 *
 *  idle ──start──▶ ┌─▶ prompt ──▶ [preparing] ──▶ chime ──▶ speaking ──┐
 *                  │   (audio)     (prepSeconds > 0)  (sound)  (countdown) │
 *                  └───────────────── next question ◀──────────────────────┤
 *                                                     last question ──▶ finished
 *  any step ──fail──▶ failed (microphone or recorder problem)
 *
 * The recorder runs only in `speaking`; it is paused during the question audio, preparation and the chime, so the
 * file holds only the student's speech. The start of each speaking window is stored in recording time (pauses
 * removed): `offsetsMs[0]` is always 0.
 *
 * Audio that fails to load or play never blocks the part: the question text stays on screen, the failure is recorded,
 * and the sequence moves on (a failed question audio still plays the chime; a failed chime still starts the countdown).
 *
 * Pure: time comes in with the actions, so tests drive it without a browser.
 */

export interface SequenceQuestion {
  prepSeconds: number;
  speakingSeconds: number;
}

export interface SequenceConfig {
  questions: readonly SequenceQuestion[];
  /**
   * Multiplies every timing. 1 in the product; the dev page may shorten it for browser tests. Never above 1.
   */
  timeScale: number;
}

export type QuestionStep =
  | { kind: "prompt" }
  | { kind: "preparing"; endsAt: number; totalMs: number }
  | { kind: "chime" }
  | { kind: "speaking"; startedAt: number; endsAt: number; totalMs: number };

export type SequencePhase =
  | { kind: "idle" }
  | { kind: "question"; index: number; step: QuestionStep }
  | { kind: "finished" }
  | { kind: "failed"; reason: string };

export type AudioCue = "question" | "chime";

export interface AudioFailure {
  index: number;
  cue: AudioCue;
  reason: string;
}

export interface SequenceState {
  config: SequenceConfig;
  phase: SequencePhase;
  /** Start of each question's speaking window in recording time (ms). */
  offsetsMs: number[];
  audioFailures: AudioFailure[];
}

export type SequenceAction =
  | { type: "start" }
  /** The question audio ended (`ok`) or failed to load/play. */
  | { type: "promptEnded"; index: number; now: number; ok: true }
  | { type: "promptEnded"; index: number; now: number; ok: false; reason: string }
  | { type: "preparationExpired"; index: number }
  /**
   * The chime ended (or failed) and the recorder has just started or resumed. `recordingMs` is the recorder's
   * recording time at that moment: the question's offset.
   */
  | { type: "speakingStarted"; index: number; now: number; recordingMs: number; chime: { ok: true } | { ok: false; reason: string } }
  | { type: "speakingExpired"; index: number }
  | { type: "fail"; reason: string };

export function createSequenceState(config: SequenceConfig): SequenceState {
  if (config.questions.length === 0) throw new Error("A question sequence needs at least one question");
  if (!(config.timeScale > 0 && config.timeScale <= 1)) throw new Error("timeScale must be in (0, 1]");
  for (const q of config.questions) {
    if (!(q.speakingSeconds > 0)) throw new Error("speakingSeconds must be positive");
    if (!(q.prepSeconds >= 0)) throw new Error("prepSeconds must not be negative");
  }
  return { config, phase: { kind: "idle" }, offsetsMs: [], audioFailures: [] };
}

export function speakingMs(config: SequenceConfig, index: number): number {
  return Math.round(config.questions[index]!.speakingSeconds * 1000 * config.timeScale);
}

export function preparationMs(config: SequenceConfig, index: number): number {
  return Math.round(config.questions[index]!.prepSeconds * 1000 * config.timeScale);
}

function isAt(state: SequenceState, index: number, step: QuestionStep["kind"]): boolean {
  return state.phase.kind === "question" && state.phase.index === index && state.phase.step.kind === step;
}

function afterPrompt(state: SequenceState, index: number, now: number): SequencePhase {
  const prep = preparationMs(state.config, index);
  return prep > 0
    ? { kind: "question", index, step: { kind: "preparing", endsAt: now + prep, totalMs: prep } }
    : { kind: "question", index, step: { kind: "chime" } };
}

export function sequenceReducer(state: SequenceState, action: SequenceAction): SequenceState {
  switch (action.type) {
    case "start":
      if (state.phase.kind !== "idle") return state;
      return { ...state, phase: { kind: "question", index: 0, step: { kind: "prompt" } } };

    case "promptEnded": {
      // Stale or duplicate events (an audio element firing both "error" and a watchdog timeout) are ignored.
      if (!isAt(state, action.index, "prompt")) return state;
      const audioFailures = action.ok
        ? state.audioFailures
        : [...state.audioFailures, { index: action.index, cue: "question" as const, reason: action.reason }];
      return { ...state, audioFailures, phase: afterPrompt(state, action.index, action.now) };
    }

    case "preparationExpired":
      if (!isAt(state, action.index, "preparing")) return state;
      return { ...state, phase: { kind: "question", index: action.index, step: { kind: "chime" } } };

    case "speakingStarted": {
      if (!isAt(state, action.index, "chime")) return state;
      const total = speakingMs(state.config, action.index);
      const audioFailures = action.chime.ok
        ? state.audioFailures
        : [...state.audioFailures, { index: action.index, cue: "chime" as const, reason: action.chime.reason }];
      return {
        ...state,
        audioFailures,
        offsetsMs: [...state.offsetsMs, Math.max(0, Math.round(action.recordingMs))],
        phase: {
          kind: "question",
          index: action.index,
          step: { kind: "speaking", startedAt: action.now, endsAt: action.now + total, totalMs: total },
        },
      };
    }

    case "speakingExpired": {
      if (!isAt(state, action.index, "speaking")) return state;
      const next = action.index + 1;
      if (next >= state.config.questions.length) return { ...state, phase: { kind: "finished" } };
      return { ...state, phase: { kind: "question", index: next, step: { kind: "prompt" } } };
    }

    case "fail":
      if (state.phase.kind === "finished" || state.phase.kind === "failed") return state;
      return { ...state, phase: { kind: "failed", reason: action.reason } };
  }
}

/** What the recorder should be doing in a phase. Only the speaking window is recorded. */
export function recorderMode(phase: SequencePhase): "off" | "paused" | "recording" | "stopped" {
  switch (phase.kind) {
    case "idle":
      return "off";
    case "question":
      return phase.step.kind === "speaking" ? "recording" : "paused";
    case "finished":
    case "failed":
      return "stopped";
  }
}

/** The audio to play in a phase, if any. */
export function cueFor(phase: SequencePhase): { index: number; cue: AudioCue } | null {
  if (phase.kind !== "question") return null;
  if (phase.step.kind === "prompt") return { index: phase.index, cue: "question" };
  if (phase.step.kind === "chime") return { index: phase.index, cue: "chime" };
  return null;
}

/**
 * Speaking time per question in recording time, from the offsets and the total recording length. Used later for
 * "you used 12 seconds for Question 2" (plan §1, Recording).
 */
export function speakingTimePerQuestionMs(offsetsMs: readonly number[], recordingMs: number): number[] {
  return offsetsMs.map((start, i) => Math.max(0, (offsetsMs[i + 1] ?? recordingMs) - start));
}

/**
 * Plays one short sound (a question's audio or the chime) and always settles: "ended", or a failure reason.
 *
 * A missing file, a decode error, a blocked play() or an element that never fires "ended" must not stop the part, so
 * a watchdog settles the cue as failed after a timeout.
 */

export type CueResult = { ok: true } | { ok: false; reason: string };

/** The part of HTMLAudioElement this module uses, so tests can pass a fake. */
export interface CueElement {
  src: string;
  readonly duration: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "ended" | "error" | "playing", listener: () => void): void;
  removeEventListener(type: "ended" | "error" | "playing", listener: () => void): void;
}

export interface CueTimeouts {
  /** No playback within this time after play() → failed ("timeout_start"). */
  startMs: number;
  /** Playback going on for longer than this → failed ("timeout_end"). Question audio is a few seconds long. */
  maxMs: number;
}

export const DEFAULT_CUE_TIMEOUTS: CueTimeouts = { startMs: 8_000, maxMs: 30_000 };

export interface CueTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const browserTimers: CueTimers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

export class CuePlayer {
  private cancelCurrent: (() => void) | null = null;

  constructor(
    private readonly element: CueElement,
    private readonly timeouts: CueTimeouts = DEFAULT_CUE_TIMEOUTS,
    private readonly timers: CueTimers = browserTimers,
  ) {}

  /**
   * Play `src`. Call the first cue from the "Start" click so the browser unlocks audio for the whole part.
   * Starting a new cue settles the previous one as "superseded".
   */
  play(src: string): Promise<CueResult> {
    this.cancelCurrent?.();
    const element = this.element;
    return new Promise<CueResult>((resolve) => {
      let settled = false;
      let startTimer: unknown = null;
      let maxTimer: unknown = null;

      const finish = (result: CueResult) => {
        if (settled) return;
        settled = true;
        element.removeEventListener("ended", onEnded);
        element.removeEventListener("error", onError);
        element.removeEventListener("playing", onPlaying);
        if (startTimer !== null) this.timers.clearTimeout(startTimer);
        if (maxTimer !== null) this.timers.clearTimeout(maxTimer);
        if (this.cancelCurrent === cancel) this.cancelCurrent = null;
        if (!result.ok) element.pause();
        resolve(result);
      };
      const onEnded = () => finish({ ok: true });
      const onError = () => finish({ ok: false, reason: "load_error" });
      const onPlaying = () => {
        if (startTimer !== null) this.timers.clearTimeout(startTimer);
        startTimer = null;
      };
      const cancel = () => finish({ ok: false, reason: "superseded" });
      this.cancelCurrent = cancel;

      element.addEventListener("ended", onEnded);
      element.addEventListener("error", onError);
      element.addEventListener("playing", onPlaying);
      startTimer = this.timers.setTimeout(() => finish({ ok: false, reason: "timeout_start" }), this.timeouts.startMs);
      maxTimer = this.timers.setTimeout(() => finish({ ok: false, reason: "timeout_end" }), this.timeouts.maxMs);

      element.src = src;
      let started: Promise<void>;
      try {
        started = element.play();
      } catch {
        finish({ ok: false, reason: "play_rejected" });
        return;
      }
      started.catch((cause: unknown) => {
        const name = cause instanceof Error ? cause.name : "";
        finish({ ok: false, reason: name === "NotAllowedError" ? "autoplay_blocked" : "play_rejected" });
      });
    });
  }

  /** Stop any sound and settle the current cue. */
  stop(): void {
    this.cancelCurrent?.();
    this.element.pause();
  }
}

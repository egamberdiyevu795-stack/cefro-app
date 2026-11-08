import { RecordingClock } from "./recording-clock";

/** Preferred formats, best first (same list as the Part 2 recorder). */
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const AUDIO_BITS_PER_SECOND = 32_000;

export interface PausedRecording {
  blob: Blob;
  mimeType: string;
  /** Recording time (pauses removed). */
  durationMs: number;
}

/** The part of MediaRecorder this class uses, so tests can pass a fake. */
export interface RecorderLike {
  readonly state: "inactive" | "recording" | "paused";
  readonly mimeType: string;
  start(timeslice?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export type RecorderFactory = (stream: MediaStream, options: MediaRecorderOptions) => RecorderLike;

const defaultFactory: RecorderFactory = (stream, options) => new MediaRecorder(stream, options) as unknown as RecorderLike;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * One recording file for a whole part, recorded only while the student speaks.
 *
 * `record()` starts the recorder the first time and resumes it afterwards; `pause()` pauses it. The file is one
 * continuous recording with the paused stretches left out, and `elapsedMs()` is the position in that file.
 */
export class PausableRecorder {
  private recorder: RecorderLike | null = null;
  private chunks: Blob[] = [];
  private failure: ((reason: string) => void) | null = null;
  readonly clock: RecordingClock;

  constructor(
    private readonly stream: MediaStream,
    options: { now?: () => number; factory?: RecorderFactory; onError?: (reason: string) => void } = {},
  ) {
    this.clock = new RecordingClock(options.now);
    this.factory = options.factory ?? defaultFactory;
    this.failure = options.onError ?? null;
  }

  private readonly factory: RecorderFactory;

  get state(): RecorderLike["state"] {
    return this.recorder?.state ?? "inactive";
  }

  /** Start (first call) or resume recording. Returns the recording time at that moment: the next question's offset. */
  record(): number {
    if (!this.recorder) {
      const mimeType = pickMimeType();
      const recorder = this.factory(this.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      recorder.onerror = (event) => {
        console.error("[cefro] recorder error", event);
        this.failure?.("recorder_failed");
      };
      recorder.start(1000);
      this.recorder = recorder;
    } else if (this.recorder.state === "paused") {
      this.recorder.resume();
    }
    const offset = this.clock.elapsedMs();
    this.clock.resume();
    return offset;
  }

  pause(): void {
    if (this.recorder?.state === "recording") this.recorder.pause();
    this.clock.pause();
  }

  elapsedMs(): number {
    return this.clock.elapsedMs();
  }

  /** Stop and return the one recording file (null when nothing was recorded). */
  stop(): Promise<PausedRecording | null> {
    const recorder = this.recorder;
    this.clock.pause();
    if (!recorder || recorder.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(this.chunks, { type });
        resolve(blob.size > 0 ? { blob, mimeType: type, durationMs: Math.round(this.clock.elapsedMs()) } : null);
      };
      recorder.stop();
    });
  }
}

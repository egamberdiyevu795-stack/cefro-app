import type { PointId } from "@/domain/speaking/argument-task";

/**
 * How a part runs INSIDE the full mock (features/full-mock): the same screens, spoken intros, chimes, preparation and
 * speaking times as the part's own practice page, minus what only a single-part visit has (the brief with its microphone
 * check and Start button, the session, the history list, the retry goal) and minus the upload and the result, which the
 * mock's runner owns so that a part is sent while the next part's introduction plays.
 */
export interface EmbeddedRecording {
  blob: Blob;
  durationMs: number;
  mimeType: string;
  /** Part 1: the start of each question's speaking window in the one recording (ms). */
  questionOffsetsMs?: readonly number[];
  /** Part 3: the points the student ticked on the preparation screen. */
  chosenPoints?: readonly PointId[];
}

export interface EmbeddedPart {
  /**
   * One audio element for the whole mock, created inside the "Start mock" tap: phones only allow sound that a tap
   * unlocked, and a part that starts by itself (Part 2 after Part 1.2) would otherwise lose its spoken introduction.
   */
  audio: HTMLAudioElement;
  /** Mock mode: nothing is sent, not even analytics. */
  mock: boolean;
  /** Mock mode, browser tests only: shortens preparation and speaking time (Parts 1 and 3). */
  timeScale?: number;
  /** The part's recording is done (time was up or the student pressed Finish). The runner takes it from here. */
  onRecorded(recording: EmbeddedRecording): void;
}

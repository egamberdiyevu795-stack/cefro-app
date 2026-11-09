/**
 * Recording time: time while the recorder was actually recording, with pauses removed.
 *
 * MediaRecorder's file timeline skips paused stretches, so a question's offset in the file is the active time
 * recorded before it. The clock is measured here rather than read from the recorder, which exposes no position.
 */
export class RecordingClock {
  private activeSince: number | null = null;
  private accumulated = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  get running(): boolean {
    return this.activeSince !== null;
  }

  /** Start or resume. No effect while already running. */
  resume(): void {
    if (this.activeSince === null) this.activeSince = this.now();
  }

  /** Pause. No effect while already paused. */
  pause(): void {
    if (this.activeSince === null) return;
    this.accumulated += this.now() - this.activeSince;
    this.activeSince = null;
  }

  elapsedMs(): number {
    return this.accumulated + (this.activeSince === null ? 0 : this.now() - this.activeSince);
  }
}

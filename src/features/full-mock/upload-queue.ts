import type { ExamPartId } from "@/domain/speaking/exam-part";
import { ApiError, submitRecording, waitBeforeRetry } from "@/features/speaking-practice/lib/api-client";
import type { EmbeddedRecording } from "@/features/speaking-practice/lib/mock-embed";

/**
 * Sends each part of a mock the moment it ends, while the next part's introduction plays, and keeps going in the
 * background. The student never waits for an upload between parts; the runner looks at this only after the last part.
 *
 * Each part has one idempotency key (`clientAttemptId`), so a resend, an automatic retry or a double tap can never create
 * a second attempt. A recording stays in memory until it is sent. Failures are sorted by what can help:
 *   - the server is busy with the student's earlier answers (429 `too_many_in_progress`): wait as long as it says, send again;
 *   - no connection, a timeout, a temporary server error: the API client already retried; the part stays "failed" and is
 *     sent again by `retry()` (the "Send again" button) or when the browser comes back online;
 *   - anything else (consent withdrawn, the mock closed, a refused recording): "failed" with `final` true, no retry helps.
 */
export type UploadState =
  | { kind: "sending" }
  | { kind: "sent"; attemptId: string }
  | { kind: "failed"; message: string; final: boolean };

export interface UploadJob {
  part: ExamPartId;
  taskId: string;
  sessionId: string;
  clientAttemptId: string;
  recording: EmbeddedRecording;
}

export type SendFn = (job: UploadJob) => Promise<{ attemptId: string }>;

export const sendToServer: SendFn = async (job) => {
  const { attempt } = await submitRecording({
    taskId: job.taskId,
    sessionId: job.sessionId,
    audio: job.recording.blob,
    durationMs: job.recording.durationMs,
    previousAttemptId: null,
    clientAttemptId: job.clientAttemptId,
    questionOffsetsMs: job.recording.questionOffsetsMs,
    chosenPoints: job.recording.chosenPoints,
  });
  return { attemptId: attempt.id };
};

/** Errors for which sending the same recording again can never help. */
const FINAL_CODES = new Set([
  "consent_required",
  "mock_expired",
  "mock_not_in_progress",
  "mock_part_done",
  "task_not_found",
  "unsupported_audio",
  "empty_audio",
  "audio_too_large",
  "invalid_fields",
  "daily_limit_reached",
]);

/** How many times a busy server (429 `too_many_in_progress`) is waited for before the part is shown as failed. */
export const MAX_BUSY_WAITS = 8;
/** The longest single wait for a busy server. */
export const MAX_BUSY_WAIT_SECONDS = 60;

export class MockUploads {
  private readonly states = new Map<ExamPartId, UploadState>();
  private readonly jobs = new Map<ExamPartId, UploadJob>();
  private readonly listeners = new Set<() => void>();
  private snapshotCache: Partial<Record<ExamPartId, UploadState>> = {};

  constructor(
    private readonly send: SendFn = sendToServer,
    private readonly wait: (ms: number) => Promise<void> = waitBeforeRetry,
  ) {}

  /** Start sending a part. A part already sent or being sent is left alone. */
  enqueue(job: UploadJob): void {
    const state = this.states.get(job.part);
    if (state?.kind === "sent" || state?.kind === "sending") return;
    this.jobs.set(job.part, job);
    void this.run(job);
  }

  /** Send every part that failed (and can still be sent) again. */
  retryFailed(): void {
    for (const [part, state] of this.states) {
      const job = this.jobs.get(part);
      if (state.kind === "failed" && !state.final && job) void this.run(job);
    }
  }

  get(part: ExamPartId): UploadState | undefined {
    return this.states.get(part);
  }

  /** A new object each time something changed, so it can be a React state or a `useSyncExternalStore` snapshot. */
  snapshot(): Partial<Record<ExamPartId, UploadState>> {
    return this.snapshotCache;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The recordings are no longer needed (the page is going away or the mock is done). */
  clear(): void {
    this.jobs.clear();
  }

  private set(part: ExamPartId, state: UploadState): void {
    this.states.set(part, state);
    this.snapshotCache = { ...this.snapshotCache, [part]: state };
    for (const listener of this.listeners) listener();
  }

  private async run(job: UploadJob): Promise<void> {
    this.set(job.part, { kind: "sending" });
    for (let busy = 0; ; busy++) {
      try {
        const { attemptId } = await this.send(job);
        this.set(job.part, { kind: "sent", attemptId });
        this.jobs.delete(job.part);
        return;
      } catch (error) {
        if (error instanceof ApiError && error.code === "too_many_in_progress" && busy < MAX_BUSY_WAITS) {
          await this.wait(Math.min(error.retryAfterSeconds ?? 30, MAX_BUSY_WAIT_SECONDS) * 1000);
          continue;
        }
        const message = error instanceof ApiError ? error.userMessage : "Something went wrong while sending this part.";
        this.set(job.part, { kind: "failed", message, final: error instanceof ApiError && FINAL_CODES.has(error.code) });
        return;
      }
    }
  }
}

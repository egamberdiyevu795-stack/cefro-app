import type { AttemptSummary, AttemptView } from "@/domain/speaking/attempt";
import type { MockResultSource } from "@/features/mock-result/part-source";
import { track } from "./analytics";

/**
 * Typed browser-side client for the speaking API. Every failure becomes an
 * ApiError carrying a student-friendly message; raw errors are logged to
 * the console for developers. Requests that are safe to repeat are retried
 * with backoff, so a dropped packet or a cold start never reaches the student.
 */
export class ApiError extends Error {
  constructor(
    readonly kind: "network" | "http" | "timeout",
    readonly code: string,
    readonly userMessage: string,
    readonly status?: number,
    /** Seconds from the server's Retry-After header, when it sent one. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(userMessage);
    this.name = "ApiError";
  }
}

const NETWORK_MESSAGE = "We couldn't reach CEFRO. Check your internet connection and try again.";

/** Statuses that mean "try again shortly" (gateways, cold starts, a briefly unavailable database). */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
/** A server asking us to wait longer than this means a real limit, not a blip: report it instead of retrying. */
const MAX_RETRY_AFTER_MS = 10_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 8_000;

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  /** Extra tries after a network error, timeout or temporary server error. Only for requests safe to repeat. */
  retries?: number;
}

/** Wait before the next try; returns early when the browser reports the connection is back. */
export function waitBeforeRetry(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      if (typeof window !== "undefined") window.removeEventListener("online", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    if (typeof window !== "undefined") window.addEventListener("online", done);
  });
}

export function backoffDelayMs(attempt: number, retryAfterSeconds?: number | null): number {
  if (retryAfterSeconds != null && retryAfterSeconds > 0) return retryAfterSeconds * 1000;
  const exponential = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return exponential / 2 + Math.random() * (exponential / 2);
}

/** Whether an error is a temporary condition that the same request may get past. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.kind !== "http") return true;
  if (!error.status || !RETRYABLE_STATUSES.has(error.status)) return false;
  return error.retryAfterSeconds == null || error.retryAfterSeconds * 1000 <= MAX_RETRY_AFTER_MS;
}

/**
 * Exam laptop (docs/v1-plan.md section 6): while a student takes their mock on the teacher's laptop, every request carries the
 * one-mock pass (the laptop itself is named by its device session cookie). The server accepts them only on the mock's start and finish and the recording upload, and
 * then acts as the student. Set when the laptop's mock starts, cleared when it ends; never set at home.
 */
let examPass: { passId: string } | null = null;
export function setExamPass(pass: { passId: string } | null): void {
  examPass = pass;
}

async function requestOnce<T>(input: string, init?: RequestOptions): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    if (examPass) {
      headers.set("x-exam-pass", examPass.passId);
    }
    response = await fetch(input, {
      ...init,
      headers,
      credentials: "same-origin",
      signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000),
    });
  } catch (error) {
    console.error("[cefro] request failed", input, error);
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    throw new ApiError(
      isTimeout ? "timeout" : "network",
      isTimeout ? "timeout" : "network",
      isTimeout ? "The request took too long. Please try again." : NETWORK_MESSAGE,
    );
  }

  const retryAfter = Number(response.headers.get("retry-after"));
  const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    console.error("[cefro] API error", input, response.status, body);
    throw new ApiError(
      "http",
      body?.error?.code ?? "http_error",
      body?.error?.message ?? "Something went wrong. Please try again.",
      response.status,
      retryAfterSeconds,
    );
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    // A cut-off body or a proxy's HTML page instead of our JSON: a transient transport problem.
    console.error("[cefro] unreadable response", input, error);
    throw new ApiError("network", "network", NETWORK_MESSAGE);
  }
}

async function request<T>(input: string, init?: RequestOptions): Promise<T> {
  const retries = init?.retries ?? 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestOnce<T>(input, init);
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) throw error;
      await waitBeforeRetry(backoffDelayMs(attempt, error instanceof ApiError ? error.retryAfterSeconds : null));
    }
  }
}

/** Ask the server for a practice session id (a correlation key; the flow works without one). */
export function startSession(): Promise<{ sessionId: string }> {
  return request("/api/sessions", { method: "POST", retries: 2 });
}

export function submitRecording(input: {
  taskId: string;
  sessionId?: string | null;
  audio: Blob;
  durationMs: number;
  previousAttemptId: string | null;
  /** Idempotency key for this recording: resending with the same key never creates a second attempt. */
  clientAttemptId: string;
  /** Part 1: the start of each question's speaking window in the one recording (ms). */
  questionOffsetsMs?: readonly number[] | null;
  /** Part 3: the points the student ticked on the preparation screen ("F1".."A3"). Feedback only. */
  chosenPoints?: readonly string[] | null;
}): Promise<{ attempt: AttemptView }> {
  const form = new FormData();
  const extension = input.audio.type.includes("mp4") ? "mp4" : input.audio.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", input.audio, `recording.${extension}`);
  form.append("taskId", input.taskId);
  form.append("durationMs", String(Math.round(input.durationMs)));
  if (input.previousAttemptId) form.append("previousAttemptId", input.previousAttemptId);
  if (input.sessionId) form.append("sessionId", input.sessionId);
  form.append("clientAttemptId", input.clientAttemptId);
  if (input.questionOffsetsMs?.length) form.append("questionOffsetsMs", JSON.stringify(input.questionOffsetsMs));
  if (input.chosenPoints?.length) form.append("chosenPoints", JSON.stringify(input.chosenPoints));
  // Safe to resend thanks to clientAttemptId; slow mobile uploads get a generous timeout per try.
  const startedAt = performance.now();
  return request<{ attempt: AttemptView }>("/api/speaking/attempts", { method: "POST", body: form, timeoutMs: 180_000, retries: 4 }).then((result) => {
    // How long the student waited for the upload (retries included). Best effort, never affects the upload.
    track("upload_completed", {
      taskId: input.taskId,
      attemptId: result.attempt.id,
      properties: { uploadMs: Math.round(performance.now() - startedAt), bytes: input.audio.size },
    });
    return result;
  });
}

export function fetchAttempt(attemptId: string): Promise<{ attempt: AttemptView }> {
  return request(`/api/speaking/attempts/${encodeURIComponent(attemptId)}`, { timeoutMs: 20_000, retries: 3 });
}

export function restartProcessing(attemptId: string): Promise<{ started: boolean; attempt: AttemptView }> {
  // The endpoint is idempotent (an attempt already processing is left alone), so it is safe to repeat.
  return request(`/api/speaking/attempts/${encodeURIComponent(attemptId)}/process`, { method: "POST", retries: 3 });
}

/** "Was this feedback helpful?": the first answer is kept, so repeating the request is safe. Returns the stored answer. */
export function saveFeedbackHelpful(attemptId: string, helpful: boolean): Promise<{ helpful: boolean }> {
  return request(`/api/speaking/attempts/${encodeURIComponent(attemptId)}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ helpful }),
    retries: 2,
  });
}

export function fetchTaskAttempts(taskId: string): Promise<{ attempts: AttemptSummary[] }> {
  return request(`/api/speaking/tasks/${encodeURIComponent(taskId)}/attempts`, { retries: 3 });
}

export function attemptAudioUrl(attemptId: string): string {
  return `/api/speaking/attempts/${encodeURIComponent(attemptId)}/audio`;
}

/** The full mock exam (docs/v1-plan.md, section 3.2), as the server describes it. */
export interface MockExamView {
  id: string;
  status: "in_progress" | "finished" | "not_finished";
  createdAt: string;
  finishedAt: string | null;
  parts: { part: "1.1" | "1.2" | "2" | "3"; attemptId: string | null; taskId: string | null; taskTitle: string | null; attemptStatus: string | null }[];
  nextPart: "1.1" | "1.2" | "2" | "3" | null;
  expiresAt: string;
}

/** Start a full mock, or get the one already in progress (`resumed`). Safe to repeat. */
export function startMockExam(): Promise<{ mock: MockExamView; resumed: boolean }> {
  return request("/api/mock-exams", { method: "POST", retries: 2 });
}

/** Mark the mock finished once all four parts were sent. Safe to repeat. */
export function finishMockExam(mockId: string): Promise<{ mock: MockExamView }> {
  return request(`/api/mock-exams/${encodeURIComponent(mockId)}/finish`, { method: "POST", retries: 3 });
}

/** The mock result page's data (the four parts, each "scoring" until it has a band). Owner only. */
export function fetchMockResult(mockId: string): Promise<{ result: MockResultSource }> {
  return request(`/api/mock-exams/${encodeURIComponent(mockId)}/result`, { retries: 1 });
}

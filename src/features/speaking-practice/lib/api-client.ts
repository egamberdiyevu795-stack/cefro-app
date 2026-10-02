import type { AttemptSummary, AttemptView } from "@/domain/speaking/attempt";

/**
 * Typed browser-side client for the speaking API. Every failure becomes an
 * ApiError carrying a student-friendly message; raw errors are logged to
 * the console for developers.
 */
export class ApiError extends Error {
  constructor(
    readonly kind: "network" | "http" | "timeout",
    readonly code: string,
    readonly userMessage: string,
    readonly status?: number,
  ) {
    super(userMessage);
    this.name = "ApiError";
  }
}

const NETWORK_MESSAGE = "We couldn't reach CEFRO. Check your internet connection and try again.";

async function request<T>(input: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
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

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    console.error("[cefro] API error", input, response.status, body);
    throw new ApiError(
      "http",
      body?.error?.code ?? "http_error",
      body?.error?.message ?? "Something went wrong. Please try again.",
      response.status,
    );
  }
  return (await response.json()) as T;
}

export function submitRecording(input: {
  taskId: string;
  audio: Blob;
  durationMs: number;
  previousAttemptId: string | null;
}): Promise<{ attempt: AttemptView }> {
  const form = new FormData();
  const extension = input.audio.type.includes("mp4") ? "mp4" : input.audio.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", input.audio, `recording.${extension}`);
  form.append("taskId", input.taskId);
  form.append("durationMs", String(Math.round(input.durationMs)));
  if (input.previousAttemptId) form.append("previousAttemptId", input.previousAttemptId);
  return request("/api/speaking/attempts", { method: "POST", body: form, timeoutMs: 120_000 });
}

export function fetchAttempt(attemptId: string): Promise<{ attempt: AttemptView }> {
  return request(`/api/speaking/attempts/${encodeURIComponent(attemptId)}`);
}

export function restartProcessing(attemptId: string): Promise<{ started: boolean; attempt: AttemptView }> {
  return request(`/api/speaking/attempts/${encodeURIComponent(attemptId)}/process`, { method: "POST" });
}

export function fetchTaskAttempts(taskId: string): Promise<{ attempts: AttemptSummary[] }> {
  return request(`/api/speaking/tasks/${encodeURIComponent(taskId)}/attempts`);
}

export function attemptAudioUrl(attemptId: string): string {
  return `/api/speaking/attempts/${encodeURIComponent(attemptId)}/audio`;
}

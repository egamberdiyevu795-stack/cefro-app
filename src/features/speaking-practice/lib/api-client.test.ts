import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchAttempt, isRetryable, submitRecording } from "./api-client";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const attempt = { id: "a1", status: "processing" };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settle<T>(promise: Promise<T>): Promise<T> {
  const result = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  const outcome = await result;
  if ("error" in outcome) throw outcome.error;
  return outcome.value;
}

describe("speaking api client retries", () => {
  it("retries network errors and gateway errors, then succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json({ error: { code: "x", message: "bad gateway" } }, 502))
      .mockResolvedValueOnce(json({ attempt }));
    await expect(settle(fetchAttempt("a1"))).resolves.toEqual({ attempt });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("treats an unreadable success body as a transient error", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("<html>proxy</html>", { status: 200 }))
      .mockResolvedValueOnce(json({ attempt }));
    await expect(settle(fetchAttempt("a1"))).resolves.toEqual({ attempt });
  });

  it("does not retry real client errors or long Retry-After limits", async () => {
    fetchMock.mockResolvedValue(json({ error: { code: "attempt_not_found", message: "nope" } }, 404));
    await expect(settle(fetchAttempt("a1"))).rejects.toMatchObject({ code: "attempt_not_found" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(json({ error: { code: "too_many_in_progress", message: "wait" } }, 429, { "Retry-After": "30" }));
    await expect(settle(fetchAttempt("a1"))).rejects.toMatchObject({ code: "too_many_in_progress", retryAfterSeconds: 30 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after its retries and reports the last error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(settle(fetchAttempt("a1"))).rejects.toMatchObject({ kind: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("resends an upload with the same idempotency key", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(json({ attempt }, 201));
    const result = await settle(
      submitRecording({
        taskId: "t",
        audio: new Blob(["x"], { type: "audio/webm" }),
        durationMs: 1000,
        previousAttemptId: null,
        clientAttemptId: "33333333-3333-4333-8333-333333333333",
      }),
    );
    expect(result).toEqual({ attempt });
    const keys = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).body as FormData).map((f) => f.get("clientAttemptId"));
    expect(keys).toEqual(["33333333-3333-4333-8333-333333333333", "33333333-3333-4333-8333-333333333333"]);
  });

  it("classifies retryable errors", () => {
    expect(isRetryable(new ApiError("timeout", "timeout", "slow"))).toBe(true);
    expect(isRetryable(new ApiError("http", "database_unavailable", "x", 503, 5))).toBe(true);
    expect(isRetryable(new ApiError("http", "capacity_reached", "x", 503, 300))).toBe(false);
    expect(isRetryable(new ApiError("http", "invalid_fields", "x", 400))).toBe(false);
    expect(isRetryable(new Error("other"))).toBe(false);
  });
});

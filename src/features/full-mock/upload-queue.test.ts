import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/features/speaking-practice/lib/api-client";
import { MAX_BUSY_WAITS, MockUploads, type UploadJob } from "./upload-queue";

const job = (part: UploadJob["part"]): UploadJob => ({
  part,
  taskId: `task-${part}`,
  sessionId: "11111111-1111-4111-8111-111111111111",
  clientAttemptId: `22222222-2222-4222-8222-22222222222${part.length}`,
  recording: { blob: new Blob(["x"]), durationMs: 1000, mimeType: "audio/webm" },
});
const http = (status: number, code: string, retryAfter: number | null = null) => new ApiError("http", code, `message ${code}`, status, retryAfter);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("mock uploads (each part is sent in the background as it ends)", () => {
  it("sends a part and remembers its attempt id; sending does not wait for the caller", async () => {
    const send = vi.fn(async (j: UploadJob) => ({ attemptId: `attempt-${j.part}` }));
    const uploads = new MockUploads(send);
    uploads.enqueue(job("1.1"));
    expect(uploads.get("1.1")).toEqual({ kind: "sending" });
    await settle();
    expect(uploads.get("1.1")).toEqual({ kind: "sent", attemptId: "attempt-1.1" });
  });

  it("never sends a part twice: a part being sent or already sent is left alone", async () => {
    const send = vi.fn(async () => ({ attemptId: "a" }));
    const uploads = new MockUploads(send);
    uploads.enqueue(job("2"));
    uploads.enqueue(job("2"));
    await settle();
    uploads.enqueue(job("2"));
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps the same idempotency key for every try of a part, so the server can never make a second attempt", async () => {
    const keys: string[] = [];
    let n = 0;
    const uploads = new MockUploads(async (j) => {
      keys.push(j.clientAttemptId);
      if (++n === 1) throw new ApiError("network", "network", "offline");
      return { attemptId: "a" };
    });
    uploads.enqueue(job("1.2"));
    await settle();
    expect(uploads.get("1.2")).toMatchObject({ kind: "failed", final: false });
    uploads.retryFailed();
    await settle();
    expect(uploads.get("1.2")).toEqual({ kind: "sent", attemptId: "a" });
    expect(new Set(keys).size).toBe(1);
  });

  it("waits as long as the server says when it is busy with earlier answers, then sends again", async () => {
    const waits: number[] = [];
    let n = 0;
    const uploads = new MockUploads(
      async () => {
        if (++n <= 2) throw http(429, "too_many_in_progress", 30);
        return { attemptId: "a" };
      },
      async (ms) => void waits.push(ms),
    );
    uploads.enqueue(job("2"));
    await settle();
    expect(waits).toEqual([30_000, 30_000]);
    expect(uploads.get("2")).toEqual({ kind: "sent", attemptId: "a" });
  });

  it("caps a long wait, and gives up after a number of waits with a part that can be sent again", async () => {
    const waits: number[] = [];
    const uploads = new MockUploads(
      async () => {
        throw http(429, "too_many_in_progress", 600);
      },
      async (ms) => void waits.push(ms),
    );
    uploads.enqueue(job("3"));
    await settle();
    expect(waits).toHaveLength(MAX_BUSY_WAITS);
    expect(Math.max(...waits)).toBe(60_000);
    expect(uploads.get("3")).toMatchObject({ kind: "failed", final: false });
  });

  it("marks a refusal that no retry can fix as final, and does not resend it", async () => {
    for (const code of ["consent_required", "mock_expired", "mock_part_done"]) {
      const send = vi.fn(async () => {
        throw http(code === "consent_required" ? 403 : 409, code);
      });
      const uploads = new MockUploads(send);
      uploads.enqueue(job("1.1"));
      await settle();
      expect(uploads.get("1.1"), code).toMatchObject({ kind: "failed", final: true, message: `message ${code}` });
      uploads.retryFailed();
      await settle();
      expect(send, code).toHaveBeenCalledTimes(1);
    }
  });

  it("tells listeners about every change with a new snapshot object", async () => {
    const uploads = new MockUploads(async () => ({ attemptId: "a" }));
    const seen: unknown[] = [];
    uploads.subscribe(() => seen.push(uploads.snapshot()));
    uploads.enqueue(job("1.1"));
    await settle();
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
    expect(uploads.snapshot()).toEqual({ "1.1": { kind: "sent", attemptId: "a" } });
  });
});

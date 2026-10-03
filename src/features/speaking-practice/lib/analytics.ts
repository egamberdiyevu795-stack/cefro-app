import type { ClientEventName, EventProperties } from "@/domain/analytics/events";

interface QueuedEvent {
  name: ClientEventName;
  sessionId?: string | null;
  taskId?: string | null;
  attemptId?: string | null;
  properties?: EventProperties;
  occurredAt: string;
}

const queue: QueuedEvent[] = [];
/** Issued by the server (POST /api/sessions); the server re-checks it against the user on every event. */
let currentSessionId: string | null = null;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Set (or clear, with null) the session that following events belong to. Events tracked before the
 * server answered are attached when the id arrives, so `practice_opened` is not left without one.
 */
export function setAnalyticsSession(sessionId: string | null): void {
  currentSessionId = sessionId;
  if (sessionId) for (const event of queue) if (event.sessionId === undefined) event.sessionId = sessionId;
}

/**
 * Fire-and-forget product analytics. Events are batched briefly and sent
 * with `sendBeacon` when the page is hidden, so they survive navigation.
 * Analytics failures are ignored — they must never affect the student.
 */
export function track(
  name: ClientEventName,
  data: { taskId?: string | null; attemptId?: string | null; properties?: EventProperties } = {},
): void {
  if (typeof window === "undefined") return;
  queue.push({ name, ...data, sessionId: currentSessionId ?? undefined, occurredAt: new Date().toISOString() });
  if (queue.length >= 20) flush();
  else if (!flushTimer) flushTimer = setTimeout(flush, 1500);
}

function flush(useBeacon = false) {
  clearTimeout(flushTimer);
  flushTimer = undefined;
  if (queue.length === 0) return;
  const body = JSON.stringify({ events: queue.splice(0, 25) });
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/events", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // Ignore — analytics is best effort.
  }
  if (queue.length > 0) flush(useBeacon);
}

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
}

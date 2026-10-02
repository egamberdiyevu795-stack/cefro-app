import type { ClientEventName, EventProperties } from "@/domain/analytics/events";

interface QueuedEvent {
  name: ClientEventName;
  taskId?: string | null;
  attemptId?: string | null;
  properties?: EventProperties;
  occurredAt: string;
}

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

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
  queue.push({ name, ...data, occurredAt: new Date().toISOString() });
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

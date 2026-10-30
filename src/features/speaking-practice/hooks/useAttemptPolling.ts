"use client";

import { useEffect, useRef, useState } from "react";
import { IN_PROGRESS_STATUSES, type AttemptView } from "@/domain/speaking/attempt";
import { fetchAttempt } from "../lib/api-client";

const POLL_INTERVAL_MS = 2000;
/** After this long without a final state, show the "taking longer" message. */
const SLOW_AFTER_MS = 90_000;
/**
 * Only warn about the connection after this long without a single answer from the server. Each poll
 * already retries on its own, so short blips (a dropped packet, a cold start, a phone waking up) never
 * show a warning.
 */
const CONNECTION_WARNING_AFTER_MS = 30_000;

/**
 * Polls an attempt until it is completed or failed. Network blips are
 * tolerated (polling continues); only a long outage surfaces a warning,
 * and polling resumes at once when the tab becomes visible again or the
 * browser reports that it is back online.
 */
export function useAttemptPolling(
  attemptId: string | null,
  onSettled: (attempt: AttemptView) => void,
  /** Change this to start polling the same attempt again (e.g. after its processing was restarted). */
  restartKey = 0,
) {
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [isSlow, setIsSlow] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  });

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    let settled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    let lastContactAt = startedAt;

    const schedule = (delayMs: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void poll(), delayMs);
    };

    const poll = async () => {
      if (cancelled || settled || inFlight) return;
      inFlight = true;
      try {
        const { attempt: latest } = await fetchAttempt(attemptId);
        if (cancelled) return;
        lastContactAt = Date.now();
        setConnectionError(null);
        setAttempt(latest);
        const inProgress = IN_PROGRESS_STATUSES.includes(latest.status) && !latest.isStalled;
        if (!inProgress) {
          settled = true;
          onSettledRef.current(latest);
          return;
        }
      } catch {
        if (cancelled) return;
        // A hidden tab or a sleeping phone is not a connection problem: only count time the page was visible.
        const visible = typeof document === "undefined" || document.visibilityState === "visible";
        if (visible && Date.now() - lastContactAt >= CONNECTION_WARNING_AFTER_MS) {
          setConnectionError(
            typeof navigator !== "undefined" && navigator.onLine === false
              ? "Your device seems to be offline."
              : "We're having trouble reaching CEFRO.",
          );
        }
      } finally {
        inFlight = false;
      }
      if (cancelled || settled) return;
      setIsSlow(Date.now() - startedAt > SLOW_AFTER_MS);
      schedule(POLL_INTERVAL_MS);
    };

    // Coming back to the tab or regaining the network: check right away instead of waiting for a
    // (possibly throttled) timer, and don't hold the time spent away against the connection.
    const resume = () => {
      if (cancelled || settled) return;
      if (document.visibilityState !== "visible") return;
      lastContactAt = Math.max(lastContactAt, Date.now() - POLL_INTERVAL_MS);
      if (!inFlight) schedule(0);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);

    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      setIsSlow(false);
      setConnectionError(null);
    };
  }, [attemptId, restartKey]);

  return { attempt, isSlow, connectionError };
}

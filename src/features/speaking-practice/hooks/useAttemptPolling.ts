"use client";

import { useEffect, useRef, useState } from "react";
import { IN_PROGRESS_STATUSES, type AttemptView } from "@/domain/speaking/attempt";
import { ApiError, fetchAttempt } from "../lib/api-client";

const POLL_INTERVAL_MS = 2000;
/** After this long without a final state, show the "taking longer" message. */
const SLOW_AFTER_MS = 90_000;

/**
 * Polls an attempt until it is completed or failed. Network blips are
 * tolerated (polling continues); only repeated failures surface an error.
 */
export function useAttemptPolling(attemptId: string | null, onSettled: (attempt: AttemptView) => void) {
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
    let timer: ReturnType<typeof setTimeout>;
    let consecutiveErrors = 0;
    const startedAt = Date.now();

    const poll = async () => {
      try {
        const { attempt: latest } = await fetchAttempt(attemptId);
        if (cancelled) return;
        consecutiveErrors = 0;
        setConnectionError(null);
        setAttempt(latest);
        const inProgress = IN_PROGRESS_STATUSES.includes(latest.status) && !latest.isStalled;
        if (!inProgress) {
          onSettledRef.current(latest);
          return;
        }
      } catch (error) {
        if (cancelled) return;
        consecutiveErrors += 1;
        if (consecutiveErrors >= 3) {
          setConnectionError(error instanceof ApiError ? error.userMessage : "Connection problem.");
        }
      }
      setIsSlow(Date.now() - startedAt > SLOW_AFTER_MS);
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setIsSlow(false);
      setConnectionError(null);
    };
  }, [attemptId]);

  return { attempt, isSlow, connectionError };
}

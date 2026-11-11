"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isMultilevelQ8 } from "@/domain/evaluation/stored";
import type { Q8Result } from "@/domain/evaluation/q8/result";
import type { PublicArgumentTask } from "@/domain/speaking/argument-task";
import { IN_PROGRESS_STATUSES, type AttemptView } from "@/domain/speaking/attempt";
import { attemptAudioUrl } from "@/features/result/from-attempt";
import { FailedResult, ScoringResult } from "@/features/result/sections";
import { NoticeCard } from "@/features/speaking-practice/components/screens";
import { useAttemptPolling } from "@/features/speaking-practice/hooks/useAttemptPolling";
import { ApiError, restartProcessing } from "@/features/speaking-practice/lib/api-client";
import { shouldAutoRestart } from "@/features/speaking-practice/lib/failure-messages";
import { part3RealPracticeHref } from "./links";
import { Part3ScoredResult } from "./result-sections";
import { buildPart3View } from "./view-model";

/**
 * One real Part 3 attempt at its own address (/result/[attemptId]): Scoring… while it is processed (polled), then the
 * Part 3 result page, or, when the AI score could not be made (no key, no credit, a provider error) after the recording
 * and transcript were saved, "AI score not ready yet" with the transcript and the recording. The same behaviour as the
 * Part 2 `AttemptResult`, kept separate so Part 2 is untouched. The server already checked that the caller owns the
 * attempt; this keeps it up to date. "Retry with this goal" and "Record again" open the real Part 3 practice page.
 */
export function Part3AttemptResult({
  initial,
  previous,
  task,
  bandLabels,
}: {
  initial: AttemptView;
  /** The attempt this one retries, when it is one (for "Band 4 → 5" and the goal). */
  previous: AttemptView | null;
  task: PublicArgumentTask;
  bandLabels: readonly { band: number; label: string }[];
}) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(initial);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const autoRestarted = useRef(false);

  // Only an attempt that was still in progress when the page opened is restarted by itself (once).
  const mayAutoRestart = useRef(IN_PROGRESS_STATUSES.includes(initial.status) && !initial.isStalled);
  const polling = useAttemptPolling(
    attempt.id,
    (settled) => {
      if (mayAutoRestart.current && shouldAutoRestart(settled) && !autoRestarted.current) {
        autoRestarted.current = true;
        restartProcessing(settled.id)
          .then(({ attempt: restarted }) => {
            setAttempt(restarted);
            setPollKey((k) => k + 1);
          })
          .catch(() => setAttempt(settled));
        return;
      }
      setAttempt(settled);
    },
    pollKey,
  );

  const restart = useCallback(async () => {
    setIsRestarting(true);
    setRestartError(null);
    try {
      const { attempt: restarted } = await restartProcessing(attempt.id);
      setAttempt(restarted);
      setPollKey((k) => k + 1);
    } catch (error) {
      setRestartError(error instanceof ApiError ? error.userMessage : "Please try again in a moment.");
    } finally {
      setIsRestarting(false);
    }
  }, [attempt.id]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [attempt.status]);

  const recordAgain = part3RealPracticeHref(task.id, attempt.previousAttemptId ? { retry: attempt.previousAttemptId } : {});
  const shortTask = { id: task.id, title: task.title, part: 3, prompts: [] as string[] };
  const previousResult: Q8Result | null = previous?.evaluation && isMultilevelQ8(previous.evaluation.result) ? previous.evaluation.result : null;
  const audio = {
    src: attemptAudioUrl(attempt.id),
    durationMs: attempt.recordingDurationMs,
    deletedAt: attempt.audio?.deletedAt ?? null,
    deletesAt: attempt.audio?.deletesAt ?? null,
  };

  if (polling.lost) {
    return (
      <NoticeCard title="We couldn't find this answer" action={{ label: "Record a new answer", onClick: () => router.push(recordAgain) }}>
        Your recording was sent, but we can no longer find it on our side, so its result can&apos;t be shown. Please record your answer again.
      </NoticeCard>
    );
  }

  const status = attempt.isStalled ? "failed" : attempt.status;
  const failure = attempt.isStalled ? { stage: null, code: "processing_stalled" as const } : attempt.failure;
  const result = attempt.evaluation && isMultilevelQ8(attempt.evaluation.result) ? attempt.evaluation.result : null;

  if (status !== "completed" && status !== "failed") {
    const live = polling.attempt ?? attempt;
    return (
      <ScoringResult
        notice={
          polling.connectionError
            ? "We're having trouble checking on your answer. We'll keep trying."
            : polling.isSlow
              ? "This is taking longer than usual. Your recording is saved."
              : null
        }
        state={{
          kind: "scoring",
          task: shortTask,
          step: live.status === "evaluating" ? "scoring" : live.status === "transcribing" ? "transcribing" : "saved",
          transcript: live.transcript?.text ?? null,
          durationMs: attempt.recordingDurationMs,
          goal: previousResult?.retry_focus[0]?.objective ?? null,
        }}
      />
    );
  }

  if (status === "completed" && result) {
    const view = buildPart3View(result, {
      task,
      transcript: attempt.transcript?.text ?? "",
      durationMs: attempt.recordingDurationMs,
      bandLabels,
      previous: previousResult,
      isDevelopmentProvider: attempt.evaluation?.meta.isDevelopmentProvider ?? false,
    });
    return <Part3ScoredResult view={view} retryHref={part3RealPracticeHref(task.id, { retry: attempt.id })} demo={false} audio={audio} />;
  }

  // Failed (or completed without a Part 3 result we can read): "AI score not ready yet" when the transcript was
  // saved and scoring is what failed, otherwise the usual failure screen. After 30 days the recording is deleted, so
  // nothing is left to score again: only "Record again".
  return (
    <FailedResult
      state={{
        kind: "failed",
        task: shortTask,
        failure,
        aiPending: Boolean(attempt.transcript?.text.trim()) && failure?.stage === "evaluation",
        transcript: attempt.transcript?.text ?? null,
        durationMs: attempt.recordingDurationMs,
      }}
      recordHref={recordAgain}
      onTryAgain={attempt.audio?.deletedAt ? undefined : () => void restart()}
      isRetrying={isRestarting}
      retryError={restartError}
      audio={audio}
    />
  );
}

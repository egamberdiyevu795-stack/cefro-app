"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isMultilevel } from "@/domain/evaluation/stored";
import { IN_PROGRESS_STATUSES, type AttemptView } from "@/domain/speaking/attempt";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { NoticeCard } from "@/features/speaking-practice/components/screens";
import { useAttemptPolling } from "@/features/speaking-practice/hooks/useAttemptPolling";
import { track } from "@/features/speaking-practice/lib/analytics";
import { ApiError, restartProcessing } from "@/features/speaking-practice/lib/api-client";
import { shouldAutoRestart } from "@/features/speaking-practice/lib/failure-messages";
import { isEvaluated, practiceHref, type EvaluatedAttempt } from "@/features/speaking-practice/lib/practice-flow";
import { lessonForResult, lessonHref } from "@/features/lessons/choose";
import { ComparisonResult, type ComparedAttempt } from "./comparison";
import { attemptAudioUrl, resultSourceFromAttempt } from "./from-attempt";
import { FailedResult, NotScoredResult, ScoredResult, ScoringResult } from "./sections";
import { resultPageState, type BandLabel } from "./view-model";

/**
 * One attempt's result at its own address (/result/[attemptId]): Scoring… while it is processed (polled), then the
 * result page, the "couldn't score" or failure screen, and the retry comparison. The server already checked that the
 * caller owns the attempt and passes it in; this component keeps it up to date.
 *
 * Processing that failed for a temporary reason is restarted once by itself, as before; "Try again" restarts it on
 * request. Retry and record again go back to the practice page (a retry carries this attempt: ?retry=<id>).
 */
export function AttemptResult({
  initial,
  previous,
  task,
  bandLabels,
}: {
  initial: AttemptView;
  /** The attempt this one retries, when it is one (for "Band 2 → 3", the goal and the comparison). */
  previous: AttemptView | null;
  task: PublicSpeakingTask;
  bandLabels: readonly BandLabel[];
}) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(initial);
  const [comparing, setComparing] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const autoRestarted = useRef(false);

  // The page checks the attempt once through the API when it opens (the server's copy may already be a moment old),
  // then keeps polling while it is processed. Only an attempt that was still in progress when the page opened is
  // restarted by itself: opening an old failed attempt never re-runs scoring on its own.
  const mayAutoRestart = useRef(IN_PROGRESS_STATUSES.includes(initial.status) && !initial.isStalled);
  const polling = useAttemptPolling(
    attempt.id,
    (settled) => {
      // A temporary provider hiccup or a stalled run gets one silent retry from the saved recording.
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

  // The same events the practice page used to send when it showed the feedback.
  const viewed = useRef<string | null>(null);
  useEffect(() => {
    if (!isEvaluated(attempt) || viewed.current === attempt.id) return;
    viewed.current = attempt.id;
    const result = attempt.evaluation.result;
    track("feedback_viewed", {
      taskId: task.id,
      attemptId: attempt.id,
      properties: { attemptNumber: attempt.attemptNumber, band: isMultilevel(result) ? result.scoring.band : null },
    });
  }, [attempt, task.id]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [comparing, attempt.status]);

  const retryWithGoal = () => router.push(practiceHref(task.id, { retry: attempt.id }));
  // Record again: a retry stays a retry of the attempt it came from (same goal).
  const recordAgain = practiceHref(task.id, attempt.previousAttemptId ? { retry: attempt.previousAttemptId } : {});

  if (polling.lost) {
    return (
      <NoticeCard title="We couldn't find this answer" action={{ label: "Record a new answer", onClick: () => router.push(recordAgain) }}>
        Your recording was sent, but we can no longer find it on our side, so its result can&apos;t be shown. This can happen if you signed in
        or out in another tab. Please record your answer again.
      </NoticeCard>
    );
  }

  if (comparing && previous && isEvaluated(previous) && isEvaluated(attempt)) {
    const before = compared(previous);
    const after = compared(attempt);
    if (before && after) {
      return <ComparisonResult before={before} after={after} taskTitle={task.title} onRetry={retryWithGoal} onBack={() => setComparing(false)} />;
    }
  }

  const source = resultSourceFromAttempt(attempt, { task, bandLabels, previous });
  if (!source) {
    return (
      <NoticeCard title="This attempt was scored with an older method" action={{ label: "Practise this task", onClick: () => router.push(practiceHref(task.id)) }}>
        It has no Part {task.part} band, so it can&apos;t be shown on the new result page. Record a new answer to get one.
      </NoticeCard>
    );
  }
  const view = resultPageState(source);
  const audio = {
    src: attemptAudioUrl(attempt.id),
    durationMs: attempt.recordingDurationMs,
    deletedAt: attempt.audio?.deletedAt ?? null,
    deletesAt: attempt.audio?.deletesAt ?? null,
  };
  const goal = previous?.evaluation?.result.retry_focus[0]?.objective ?? null;

  switch (view.kind) {
    case "scoring": {
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
          state={{ ...view, step: live.status === "evaluating" ? "scoring" : live.status === "transcribing" ? "transcribing" : "saved", transcript: live.transcript?.text ?? view.transcript, goal }}
        />
      );
    }
    case "scored": {
      const lesson = source.evaluation ? lessonForResult(source.evaluation.result) : null;
      return (
        <ScoredResult
          view={view.view}
          task={task}
          audio={audio}
          retryHref={retryWithGoal}
          lesson={lesson ? { href: lessonHref(lesson, { attempt: attempt.id }), title: lesson.title } : null}
          onCompare={view.view.retry && previous && isEvaluated(previous) ? () => {
            setComparing(true);
            track("comparison_viewed", { taskId: task.id, attemptId: attempt.id, properties: { previousAttemptId: previous.id } });
          } : null}
        />
      );
    }
    case "not_scored":
      return <NotScoredResult state={view} audio={audio} recordHref={recordAgain} />;
    case "failed":
      // After 30 days the recording is deleted: nothing is left to score again, so only "Record again".
      return (
        <FailedResult
          state={view}
          recordHref={recordAgain}
          onTryAgain={attempt.audio?.deletedAt ? undefined : () => void restart()}
          audio={audio}
          isRetrying={isRestarting}
          retryError={restartError}
        />
      );
  }
}

/** The comparison's input: a stored, multilevel-scored attempt. */
function compared(attempt: EvaluatedAttempt): ComparedAttempt | null {
  const result = attempt.evaluation.result;
  if (!isMultilevel(result)) return null;
  return {
    attemptNumber: attempt.attemptNumber,
    result,
    metrics: attempt.metrics,
    methodology: `${attempt.evaluation.meta.evaluatorVersion}|${attempt.evaluation.meta.rubricVersion}`,
    transcript: attempt.transcript.text,
  };
}

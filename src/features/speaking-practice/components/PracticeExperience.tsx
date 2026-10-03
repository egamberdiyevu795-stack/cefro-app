"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import type { AttemptSummary, AttemptView } from "@/domain/speaking/attempt";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { useAttemptPolling } from "../hooks/useAttemptPolling";
import { useAudioLevel } from "../hooks/useAudioLevel";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useDeadline } from "../hooks/useDeadline";
import { setAnalyticsSession, track } from "../lib/analytics";
import { ApiError, fetchAttempt, fetchTaskAttempts, restartProcessing, startSession, submitRecording } from "../lib/api-client";
import { initialPracticeState, practiceReducer } from "../lib/practice-machine";
import { AttemptHistory } from "./AttemptHistory";
import { BriefPanel } from "./BriefPanel";
import { ComparisonView } from "./ComparisonView";
import { FailurePanel } from "./FailurePanel";
import { FeedbackReport, isEvaluated } from "./FeedbackReport";
import { MicrophoneError } from "./MicrophoneError";
import { PreparationPanel } from "./PreparationPanel";
import { ProcessingPanel } from "./ProcessingPanel";
import { RecordingPanel } from "./RecordingPanel";
import { RetryBriefPanel } from "./RetryBriefPanel";
import { ReviewPanel } from "./ReviewPanel";
import { TaskHeader } from "./TaskHeader";
import { UploadFailedPanel } from "./UploadFailedPanel";

/**
 * The B2 Part 2 practice loop: brief → prepare → record → submit →
 * processing → feedback → retry → comparison.
 *
 * This component wires state, side effects and analytics together; the
 * panels it renders are presentational.
 */
export function PracticeExperience({ task }: { task: PublicSpeakingTask }) {
  const [state, dispatch] = useReducer(practiceReducer, initialPracticeState);
  const { phase } = state;
  const recorder = useAudioRecorder();
  const level = useAudioLevel(recorder.stream, phase.kind === "recording");

  const [history, setHistory] = useState<AttemptSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [openingAttemptId, setOpeningAttemptId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  const taskId = task.id;
  const retryOfId = state.retryOf?.id ?? null;

  // ── History ──────────────────────────────────────────────────────
  // Refresh after an attempt settles. Failures are ignored: the flow works without history.
  const loadHistory = useCallback(async () => {
    try {
      setHistory((await fetchTaskAttempts(taskId)).attempts);
    } catch {
      // Non-critical.
    }
  }, [taskId]);

  // One practice session per visit, issued by the server. If it cannot be created the practice flow
  // still works: the server then creates a session when the recording is submitted.
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setAnalyticsSession(null);
    startSession()
      .then(({ sessionId }) => {
        if (cancelled) return;
        sessionIdRef.current = sessionId;
        setAnalyticsSession(sessionId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sessionIdRef.current = null;
      setAnalyticsSession(null);
    };
  }, [taskId]);

  useEffect(() => {
    track("practice_opened", { taskId });
    let cancelled = false;
    fetchTaskAttempts(taskId)
      .then(({ attempts }) => !cancelled && setHistory(attempts))
      .catch(() => undefined)
      .finally(() => !cancelled && setHistoryLoading(false));
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // ── Preparation & recording ──────────────────────────────────────
  const startPreparation = useCallback(async () => {
    setPageError(null);
    const ready = await recorder.requestMicrophone();
    if (!ready) {
      track("microphone_permission_denied", { taskId });
      return;
    }
    dispatch({ type: "preparationStarted", now: Date.now(), preparationMs: task.preparationSeconds * 1000 });
    if (retryOfId) track("retry_started", { taskId, attemptId: retryOfId });
    track("preparation_started", { taskId, properties: { isRetry: Boolean(retryOfId) } });
  }, [recorder, task.preparationSeconds, taskId, retryOfId]);

  const startRecording = useCallback(
    (preparationSkipped: boolean) => {
      track("preparation_completed", { taskId, properties: { skipped: preparationSkipped } });
      if (!recorder.start()) return;
      dispatch({ type: "recordingStarted", now: Date.now(), speakingMs: task.speakingSeconds * 1000 });
      track("recording_started", { taskId, properties: { isRetry: Boolean(retryOfId) } });
    },
    [recorder, task.speakingSeconds, taskId, retryOfId],
  );

  const finishingRef = useRef(false);
  const finishRecording = useCallback(
    async (reason: "student" | "time_limit") => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      const recording = await recorder.stop();
      finishingRef.current = false;
      dispatch({ type: "recordingStopped" });
      if (recording) {
        track("recording_completed", {
          taskId,
          properties: { durationMs: Math.round(recording.durationMs), reason, mimeType: recording.mimeType },
        });
      }
    },
    [recorder, taskId],
  );

  const reRecord = useCallback(async () => {
    track("recording_discarded", { taskId });
    recorder.discard();
    const ready = await recorder.requestMicrophone();
    if (!ready) return;
    if (recorder.start()) {
      dispatch({ type: "recordingStarted", now: Date.now(), speakingMs: task.speakingSeconds * 1000 });
      track("recording_started", { taskId, properties: { isRetry: Boolean(retryOfId), reRecord: true } });
    }
  }, [recorder, task.speakingSeconds, taskId, retryOfId]);

  const deadline = phase.kind === "preparing" || phase.kind === "recording" ? phase.endsAt : null;
  const remainingMs = useDeadline(deadline, () => {
    if (phase.kind === "preparing") startRecording(false);
    else if (phase.kind === "recording") void finishRecording("time_limit");
  });

  // ── Submission ───────────────────────────────────────────────────
  const submit = useCallback(async () => {
    const recording = recorder.recording;
    if (!recording) return;
    dispatch({ type: "uploadStarted" });
    try {
      const { attempt } = await submitRecording({
        taskId,
        sessionId: sessionIdRef.current,
        audio: recording.blob,
        durationMs: recording.durationMs,
        previousAttemptId: retryOfId,
      });
      dispatch({ type: "uploadSucceeded", attempt });
      recorder.discard();
      recorder.releaseStream(); // turn the microphone off while reading feedback
    } catch (error) {
      const message = error instanceof ApiError ? error.userMessage : "Something went wrong while sending your answer.";
      track("upload_failed", { taskId, properties: { code: error instanceof ApiError ? error.code : "unknown" } });
      dispatch({ type: "uploadFailed", message });
    }
  }, [recorder, taskId, retryOfId]);

  // ── Processing ───────────────────────────────────────────────────
  const processingId = phase.kind === "processing" ? phase.attemptId : null;
  const polling = useAttemptPolling(processingId, (attempt) => {
    dispatch({ type: "attemptUpdated", attempt });
    void loadHistory();
  });

  const restart = useCallback(async (attemptId: string) => {
    setIsRestarting(true);
    setRestartError(null);
    try {
      const { attempt } = await restartProcessing(attemptId);
      dispatch({ type: "processingRestarted", attempt });
    } catch (error) {
      setRestartError(error instanceof ApiError ? error.userMessage : "Please try again in a moment.");
    } finally {
      setIsRestarting(false);
    }
  }, []);

  // ── Results, retry, comparison ───────────────────────────────────
  const resultAttempt = phase.kind === "result" ? state.attempts[phase.attemptId] : undefined;

  const viewedFeedbackRef = useRef(new Set<string>());
  useEffect(() => {
    if (resultAttempt && isEvaluated(resultAttempt) && !viewedFeedbackRef.current.has(resultAttempt.id)) {
      viewedFeedbackRef.current.add(resultAttempt.id);
      track("feedback_viewed", {
        taskId,
        attemptId: resultAttempt.id,
        properties: {
          attemptNumber: resultAttempt.attemptNumber,
          overallLevel: resultAttempt.evaluation.result.overall_level,
        },
      });
    }
  }, [resultAttempt, taskId]);

  const openAttempt = useCallback(async (attemptId: string) => {
    setOpeningAttemptId(attemptId);
    setPageError(null);
    try {
      const { attempt } = await fetchAttempt(attemptId);
      dispatch({ type: "showAttempt", attempt });
    } catch (error) {
      setPageError(error instanceof ApiError ? error.userMessage : "We couldn't open that attempt.");
    } finally {
      setOpeningAttemptId(null);
    }
  }, []);

  const compare = useCallback(
    async (after: AttemptView) => {
      if (!after.previousAttemptId) return;
      setPageError(null);
      try {
        const before = state.attempts[after.previousAttemptId] ?? (await fetchAttempt(after.previousAttemptId)).attempt;
        dispatch({ type: "comparisonRequested", before, after });
        track("comparison_viewed", {
          taskId,
          attemptId: after.id,
          properties: { previousAttemptId: before.id },
        });
      } catch (error) {
        setPageError(error instanceof ApiError ? error.userMessage : "We couldn't load the previous attempt.");
      }
    },
    [state.attempts, taskId],
  );

  const backToBrief = useCallback(() => {
    dispatch({ type: "backToBrief" });
    void loadHistory();
  }, [loadHistory]);

  // ── Page-level behaviour ─────────────────────────────────────────
  const hasUnsentRecording = ["recording", "review", "uploading", "uploadFailed"].includes(phase.kind);
  useEffect(() => {
    if (!hasUnsentRecording) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsentRecording]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [phase.kind]);

  // ── Render ───────────────────────────────────────────────────────
  const micError = recorder.status === "error" && recorder.error;
  const retryFocus = state.retryOf?.evaluation?.result.retry_focus ?? null;

  let content: React.ReactNode;
  switch (phase.kind) {
    case "brief":
      content = (
        <BriefPanel
          task={task}
          onStart={startPreparation}
          isRequestingMicrophone={recorder.status === "requesting"}
          history={
            <AttemptHistory attempts={history} isLoading={historyLoading} onOpen={openAttempt} openingId={openingAttemptId} />
          }
        />
      );
      break;
    case "retryBrief":
      content = state.retryOf && (
        <RetryBriefPanel
          task={task}
          previous={state.retryOf}
          onStart={startPreparation}
          onCancel={backToBrief}
          isRequestingMicrophone={recorder.status === "requesting"}
        />
      );
      break;
    case "preparing":
      content = (
        <PreparationPanel task={task} remainingMs={remainingMs} focus={retryFocus} onSkip={() => startRecording(true)} />
      );
      break;
    case "recording":
      content = (
        <RecordingPanel task={task} remainingMs={remainingMs} level={level} onFinish={() => void finishRecording("student")} />
      );
      break;
    case "review":
      content = recorder.recording ? (
        <ReviewPanel
          recording={recorder.recording}
          speakingSeconds={task.speakingSeconds}
          onSubmit={submit}
          onReRecord={reRecord}
        />
      ) : (
        <Alert tone="danger" title="Your recording didn't save" actions={<Button onClick={reRecord}>Record again</Button>}>
          The browser didn&apos;t return any audio. Please check your microphone and record again.
        </Alert>
      );
      break;
    case "uploading":
      content = <ProcessingPanel status={null} isUploading isSlow={false} connectionError={null} />;
      break;
    case "uploadFailed":
      content = (
        <UploadFailedPanel message={phase.message} recording={recorder.recording} onRetry={submit} onReRecord={reRecord} />
      );
      break;
    case "processing":
      content = (
        <ProcessingPanel
          status={polling.attempt?.status ?? state.attempts[phase.attemptId]?.status ?? null}
          isUploading={false}
          isSlow={polling.isSlow}
          connectionError={polling.connectionError}
        />
      );
      break;
    case "result":
      if (!resultAttempt) {
        content = null;
      } else if (isEvaluated(resultAttempt)) {
        content = (
          <FeedbackReport
            attempt={resultAttempt}
            task={task}
            onRetry={() => dispatch({ type: "retryRequested", attempt: resultAttempt })}
            onCompare={resultAttempt.previousAttemptId ? () => void compare(resultAttempt) : null}
            onBack={backToBrief}
          />
        );
      } else {
        content = (
          <FailurePanel
            attempt={resultAttempt}
            isRestarting={isRestarting}
            restartError={restartError}
            onRestart={() => void restart(resultAttempt.id)}
            // Keep the retry link (and its focus) when a retry attempt has to be re-recorded.
            onReRecord={() =>
              state.retryOf ? dispatch({ type: "retryRequested", attempt: state.retryOf }) : backToBrief()
            }
          />
        );
      }
      break;
    case "comparison": {
      const before = state.attempts[phase.beforeId];
      const after = state.attempts[phase.afterId];
      content =
        before && after && isEvaluated(before) && isEvaluated(after) ? (
          <ComparisonView
            before={before}
            after={after}
            onRetry={() => dispatch({ type: "retryRequested", attempt: after })}
            onBack={() => dispatch({ type: "backToResult", attemptId: after.id })}
          />
        ) : (
          <Alert tone="warning" title="These attempts can't be compared yet">
            Both attempts need completed feedback before they can be compared.
          </Alert>
        );
      break;
    }
  }

  const showMicError = micError && ["brief", "retryBrief", "preparing", "recording", "review"].includes(phase.kind);

  return (
    <div className="space-y-6">
      <TaskHeader task={task} />
      {showMicError && (
        <MicrophoneError
          kind={micError}
          onRetry={() => {
            recorder.discard();
            if (phase.kind === "brief" || phase.kind === "retryBrief") void startPreparation();
            else backToBrief();
          }}
        />
      )}
      {pageError && <Alert tone="danger" title="Something went wrong">{pageError}</Alert>}
      {content}
    </div>
  );
}

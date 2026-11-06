"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import type { FeatureFlags } from "@/config/features";
import type { AttemptSummary, AttemptView } from "@/domain/speaking/attempt";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { ScoringResult } from "@/features/result/sections";
import { useAttemptPolling } from "../hooks/useAttemptPolling";
import { useAudioLevel } from "../hooks/useAudioLevel";
import { useAudioRecorder, type Recording } from "../hooks/useAudioRecorder";
import { useDeadline } from "../hooks/useDeadline";
import { setAnalyticsSession, track as trackEvent } from "../lib/analytics";
import { ApiError, fetchAttempt, fetchTaskAttempts, restartProcessing, startSession, submitRecording } from "../lib/api-client";
import { shouldAutoRestart } from "../lib/failure-messages";
import { initialPracticeState, practiceReducer, type PracticeState } from "../lib/practice-machine";
import { isEarlyFinish, mockScoringHref, retryGoalOf, scoringStep, type MockAttemptKey } from "../lib/practice-flow";
import { ComparisonView } from "./ComparisonView";
import { FailurePanel } from "./FailurePanel";
import { FeedbackReport, isEvaluated } from "./FeedbackReport";
import {
  AttemptsCard,
  BriefCard,
  MicrophoneCard,
  MicrophoneState,
  NothingRecordedCard,
  PracticeLayout,
  PreparationCard,
  RecordingCard,
  TaskCard,
} from "./screens";
import { UploadFailedPanel } from "./UploadFailedPanel";

function newClientAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Older browsers / non-secure contexts: a v4 UUID from getRandomValues.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The B2 Part 2 practice loop: brief → prepare → record → (Finish) submit → scoring → feedback → retry → comparison.
 *
 * This component wires state, side effects and analytics together; the screens it renders are presentational
 * (screens.tsx, on the design system).
 *
 * Mock mode (`mock`, from ?mock=1): the real recorder runs, but nothing is sent: no session, history or analytics,
 * and Finish opens the result page's mock "Scoring…" (then the mock result) instead of uploading.
 */
export function PracticeExperience({
  task,
  flags,
  mock = null,
  initialRetryOf = null,
  retryAttemptId = null,
}: {
  task: PublicSpeakingTask;
  flags: FeatureFlags;
  /** Mock mode; `retry` is the saved run a mock retry comes from. */
  mock?: { retry: MockAttemptKey | null } | null;
  /** Open as a retry of this attempt (mock mode builds it from a saved run). */
  initialRetryOf?: AttemptView | null;
  /** Open as a retry of this attempt, loaded from the API (?retry=<id>, from "Retry with this goal"). */
  retryAttemptId?: string | null;
}) {
  const [state, dispatch] = useReducer(
    practiceReducer,
    initialRetryOf,
    (retryOf): PracticeState => (retryOf ? practiceReducer(initialPracticeState, { type: "retryRequested", attempt: retryOf }) : initialPracticeState),
  );
  const { phase } = state;
  const router = useRouter();
  const isMock = mock !== null;
  // Mock mode sends nothing, analytics included.
  const track: typeof trackEvent = useCallback((...args) => (isMock ? undefined : trackEvent(...args)), [isMock]);
  const recorder = useAudioRecorder();
  const level = useAudioLevel(recorder.stream, phase.kind === "recording");

  const [history, setHistory] = useState<AttemptSummary[]>([]);
  // Mock mode loads no history.
  const [historyLoading, setHistoryLoading] = useState(!mock);
  const [openingAttemptId, setOpeningAttemptId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [earlyWarning, setEarlyWarning] = useState(false);

  const taskId = task.id;
  const retryOfId = state.retryOf?.id ?? null;

  // ── History ──────────────────────────────────────────────────────
  // Refresh after an attempt settles. Failures are ignored: the flow works without history.
  const loadHistory = useCallback(async () => {
    if (isMock) return;
    try {
      setHistory((await fetchTaskAttempts(taskId)).attempts);
    } catch {
      // Non-critical.
    }
  }, [taskId, isMock]);

  // One practice session per visit, issued by the server. If it cannot be created the practice flow
  // still works: the server then creates a session when the recording is submitted.
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isMock) return;
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
  }, [taskId, isMock]);

  useEffect(() => {
    track("practice_opened", { taskId });
    if (isMock) return;
    let cancelled = false;
    fetchTaskAttempts(taskId)
      .then(({ attempts }) => !cancelled && setHistory(attempts))
      .catch(() => undefined)
      .finally(() => !cancelled && setHistoryLoading(false));
    return () => {
      cancelled = true;
    };
  }, [taskId, isMock, track]);

  // Opened from "Retry with this goal" (?retry=<id>): load that attempt, then show the brief with its goal.
  useEffect(() => {
    if (!retryAttemptId) return;
    let cancelled = false;
    fetchAttempt(retryAttemptId)
      .then(({ attempt }) => {
        if (!cancelled && attempt.evaluation) dispatch({ type: "retryRequested", attempt });
      })
      .catch(() => !cancelled && setPageError("We couldn't load the attempt to retry. You can still practise the task."));
    return () => {
      cancelled = true;
    };
  }, [retryAttemptId]);

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
  }, [recorder, task.preparationSeconds, taskId, retryOfId, track]);

  const startRecording = useCallback(
    (preparationSkipped: boolean) => {
      track("preparation_completed", { taskId, properties: { skipped: preparationSkipped } });
      if (!recorder.start()) return;
      dispatch({ type: "recordingStarted", now: Date.now(), speakingMs: task.speakingSeconds * 1000 });
      track("recording_started", { taskId, properties: { isRetry: Boolean(retryOfId) } });
    },
    [recorder, task.speakingSeconds, taskId, retryOfId, track],
  );

  // Finish sends the answer straight away (no listen-back step): the next screen is "Scoring…".
  const submitRef = useRef<(recording?: Recording) => Promise<void>>(async () => undefined);
  const finishingRef = useRef(false);
  const finishRecording = useCallback(
    async (reason: "student" | "time_limit") => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      setEarlyWarning(false);
      const recording = await recorder.stop();
      finishingRef.current = false;
      dispatch({ type: "recordingStopped" });
      if (!recording) return; // "Your recording didn't save"
      track("recording_completed", {
        taskId,
        properties: { durationMs: Math.round(recording.durationMs), reason, mimeType: recording.mimeType },
      });
      if (mock) {
        // Mock mode: nothing is uploaded. The microphone goes off and the mock "Scoring…" takes over.
        recorder.discard();
        recorder.releaseStream();
        router.push(mockScoringHref(state.retryOf ? mock.retry : null));
        return;
      }
      void submitRef.current(recording);
    },
    [recorder, taskId, track, mock, router, state.retryOf],
  );

  // "Finish" very early asks first; the recording keeps running while the warning is open.
  const requestFinish = useCallback(
    (remaining: number) => {
      if (isEarlyFinish(task.speakingSeconds * 1000 - remaining, task.speakingSeconds)) setEarlyWarning(true);
      else void finishRecording("student");
    },
    [finishRecording, task.speakingSeconds],
  );

  const reRecord = useCallback(async () => {
    setEarlyWarning(false);
    track("recording_discarded", { taskId });
    recorder.discard();
    const ready = await recorder.requestMicrophone();
    if (!ready) return;
    if (recorder.start()) {
      dispatch({ type: "recordingStarted", now: Date.now(), speakingMs: task.speakingSeconds * 1000 });
      track("recording_started", { taskId, properties: { isRetry: Boolean(retryOfId), reRecord: true } });
    }
  }, [recorder, task.speakingSeconds, taskId, retryOfId, track]);

  const deadline = phase.kind === "preparing" || phase.kind === "recording" ? phase.endsAt : null;
  const remainingMs = useDeadline(deadline, () => {
    setEarlyWarning(false);
    if (phase.kind === "preparing") startRecording(false);
    else if (phase.kind === "recording") void finishRecording("time_limit");
  });

  // ── Submission ───────────────────────────────────────────────────
  // One idempotency key per recording: resending the same audio (automatic retries, "Try sending again")
  // can never create a second attempt or count against the limits twice.
  const uploadKeyRef = useRef<{ blob: Blob; id: string } | null>(null);
  const submittingRef = useRef(false);
  const submit = useCallback(async (given?: Recording) => {
    // Right after Finish the recorder's state has not re-rendered yet, so the recording is passed in.
    const recording = given ?? recorder.recording;
    if (!recording || submittingRef.current) return;
    if (uploadKeyRef.current?.blob !== recording.blob) {
      uploadKeyRef.current = { blob: recording.blob, id: newClientAttemptId() };
    }
    submittingRef.current = true;
    dispatch({ type: "uploadStarted" });
    try {
      const { attempt } = await submitRecording({
        taskId,
        sessionId: sessionIdRef.current,
        audio: recording.blob,
        durationMs: recording.durationMs,
        previousAttemptId: retryOfId,
        clientAttemptId: uploadKeyRef.current.id,
      });
      dispatch({ type: "uploadSucceeded", attempt });
      recorder.discard();
      recorder.releaseStream(); // turn the microphone off while reading feedback
    } catch (error) {
      const message = error instanceof ApiError ? error.userMessage : "Something went wrong while sending your answer.";
      track("upload_failed", { taskId, properties: { code: error instanceof ApiError ? error.code : "unknown" } });
      dispatch({ type: "uploadFailed", message });
    } finally {
      submittingRef.current = false;
    }
  }, [recorder, taskId, retryOfId, track]);
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // An upload that failed because the device went offline is sent again as soon as it is back online.
  useEffect(() => {
    if (phase.kind !== "uploadFailed") return;
    const resend = () => void submit();
    window.addEventListener("online", resend);
    return () => window.removeEventListener("online", resend);
  }, [phase.kind, submit]);

  // ── Processing ───────────────────────────────────────────────────
  const processingId = phase.kind === "processing" ? phase.attemptId : null;
  const autoRestartedRef = useRef(new Set<string>());
  const [pollRestartKey, setPollRestartKey] = useState(0);
  const polling = useAttemptPolling(processingId, (attempt) => {
    // A temporary provider hiccup or a stalled run gets one silent retry from the saved recording.
    if (shouldAutoRestart(attempt) && !autoRestartedRef.current.has(attempt.id)) {
      autoRestartedRef.current.add(attempt.id);
      restartProcessing(attempt.id)
        .then(({ attempt: restarted }) => {
          dispatch({ type: "processingRestarted", attempt: restarted });
          setPollRestartKey((key) => key + 1);
        })
        .catch(() => {
          dispatch({ type: "attemptUpdated", attempt });
          void loadHistory();
        });
      return;
    }
    dispatch({ type: "attemptUpdated", attempt });
    void loadHistory();
  }, pollRestartKey);

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
          band: resultAttempt.evaluation.result.kind === "multilevel" ? resultAttempt.evaluation.result.scoring.band : null,
        },
      });
    }
  }, [resultAttempt, taskId, track]);

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
    [state.attempts, taskId, track],
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
  const micError = recorder.status === "error" ? recorder.error : null;
  const goal = retryGoalOf(state.retryOf);
  const taskCard = (questionsFirst: boolean) => <TaskCard task={task} questionsFirst={questionsFirst} />;
  const retryMicrophone = () => {
    recorder.discard();
    if (phase.kind === "brief" || phase.kind === "retryBrief") void startPreparation();
    else backToBrief();
  };

  // A microphone problem after the brief replaces the step card (its "Try again" goes back to the brief).
  if (micError && ["preparing", "recording", "review"].includes(phase.kind)) {
    return (
      <PracticeLayout task={taskCard(true)} step={<MicrophoneCard kind={micError} onRetry={retryMicrophone} />} />
    );
  }

  const scoring = (status: AttemptView["status"] | null, notice: string | null = null) => (
    <ScoringResult
      flags={flags}
      notice={notice}
      state={{
        kind: "scoring",
        task,
        step: scoringStep(status),
        transcript: null,
        durationMs: recorder.recording?.durationMs ?? (phase.kind === "processing" ? state.attempts[phase.attemptId]?.recordingDurationMs ?? 0 : 0),
        goal: goal?.objective ?? null,
      }}
    />
  );

  let content: React.ReactNode;
  switch (phase.kind) {
    case "brief":
    case "retryBrief": {
      const isRetry = phase.kind === "retryBrief" && state.retryOf !== null;
      const microphone =
        recorder.status === "requesting" ? (
          <MicrophoneState kind="asking" onRetry={retryMicrophone} />
        ) : micError ? (
          <MicrophoneState kind={micError} onRetry={retryMicrophone} />
        ) : undefined;
      content = (
        <PracticeLayout
          task={taskCard(false)}
          step={
            <BriefCard
              task={task}
              goal={isRetry ? goal : null}
              onStart={startPreparation}
              onDropGoal={isRetry ? backToBrief : undefined}
              microphone={microphone}
            />
          }
          below={
            !isRetry && !historyLoading && <AttemptsCard attempts={history} onOpen={openAttempt} openingId={openingAttemptId} />
          }
        />
      );
      break;
    }
    case "preparing":
      content = (
        <PracticeLayout
          task={taskCard(true)}
          step={<PreparationCard task={task} remainingMs={remainingMs} goal={goal} onSkip={() => startRecording(true)} />}
        />
      );
      break;
    case "recording":
      content = (
        <PracticeLayout
          task={taskCard(true)}
          step={
            <RecordingCard
              task={task}
              remainingMs={remainingMs}
              level={level}
              goal={goal}
              earlyWarning={earlyWarning}
              onFinish={() => requestFinish(remainingMs)}
              onKeepSpeaking={() => setEarlyWarning(false)}
              onFinishAnyway={() => void finishRecording("student")}
            />
          }
        />
      );
      break;
    case "review":
      // Finish sends the answer at once; this shows only while it is being handed over, or when no audio came back.
      content = recorder.recording ? (
        scoring(null)
      ) : (
        <PracticeLayout task={taskCard(true)} step={<NothingRecordedCard onRecordAgain={reRecord} />} />
      );
      break;
    case "uploading":
      content = scoring(null);
      break;
    case "uploadFailed":
      content = (
        <UploadFailedPanel message={phase.message} recording={recorder.recording} onRetry={() => void submit()} onReRecord={reRecord} />
      );
      break;
    case "processing":
      content = polling.lost ? (
        <div className="mx-auto max-w-xl">
          <Alert
            tone="danger"
            title="We couldn't find this answer"
            actions={
              <Button
                onClick={() =>
                  state.retryOf ? dispatch({ type: "retryRequested", attempt: state.retryOf }) : backToBrief()
                }
              >
                Record a new answer
              </Button>
            }
          >
            Your recording was sent, but we can no longer find it on our side, so its feedback can&apos;t be shown.
            This can happen if you signed in or out in another tab. Please record your answer again.
          </Alert>
        </div>
      ) : (
        scoring(
          polling.attempt?.status ?? state.attempts[phase.attemptId]?.status ?? null,
          polling.connectionError
            ? "We're having trouble checking on your answer. We'll keep trying."
            : polling.isSlow
              ? "This is taking longer than usual. Your recording is saved."
              : null,
        )
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

  return (
    <div className="space-y-4">
      {pageError && <Alert tone="danger" title="Something went wrong">{pageError}</Alert>}
      {content}
    </div>
  );
}

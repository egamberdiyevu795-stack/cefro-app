"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { FeatureFlags } from "@/config/features";
import type { AttemptSummary, AttemptView } from "@/domain/speaking/attempt";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { ScoringResult } from "@/features/result/sections";
import { useAudioLevel } from "../hooks/useAudioLevel";
import { useAudioRecorder, type Recording } from "../hooks/useAudioRecorder";
import { useDeadline } from "../hooks/useDeadline";
import { setAnalyticsSession, track as trackEvent } from "../lib/analytics";
import { ApiError, fetchAttempt, fetchTaskAttempts, startSession, submitRecording } from "../lib/api-client";
import { initialPracticeState, practiceReducer, type PracticeState } from "../lib/practice-machine";
import { playChime, primeChime } from "../lib/chime";
import { isEarlyFinish, mockScoringHref, retryGoalOf, scoringStep, type MockAttemptKey } from "../lib/practice-flow";
import {
  AttemptsCard,
  BriefCard,
  InlineNotice,
  MicrophoneCard,
  MicrophoneState,
  NothingRecordedCard,
  PracticeLayout,
  PreparationCard,
  RecordingCard,
  TaskCard,
  UploadFailedCard,
} from "./screens";

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
 * The B2 Part 2 practice loop: brief → prepare → record → (Finish) upload, then the attempt's own result page
 * (/result/[id]: Scoring…, result, retry, comparison). A retry comes back here with ?retry=<id>.
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
  const [pageError, setPageError] = useState<string | null>(null);
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
      // The session is not cleared on leaving: the result page of this visit (/result/[id]) still belongs to it.
      cancelled = true;
      sessionIdRef.current = null;
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
    primeChime(); // inside the click, so the beep is allowed when preparation runs out a minute later
    const ready = await recorder.requestMicrophone();
    if (!ready) {
      track("microphone_permission_denied", { taskId });
      return;
    }
    dispatch({ type: "preparationStarted", now: Date.now(), preparationMs: task.preparationSeconds * 1000 });
    if (retryOfId) track("retry_started", { taskId, attemptId: retryOfId });
    track("preparation_started", { taskId, properties: { isRetry: Boolean(retryOfId) } });
  }, [recorder, task.preparationSeconds, taskId, retryOfId, track]);

  // The start-of-speaking beep (whether preparation ran out or was skipped), then recording: the beep is not recorded.
  const startingRef = useRef(false);
  const startRecording = useCallback(
    async (preparationSkipped: boolean) => {
      if (startingRef.current) return;
      startingRef.current = true;
      track("preparation_completed", { taskId, properties: { skipped: preparationSkipped } });
      await playChime();
      startingRef.current = false;
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
    await playChime();
    if (recorder.start()) {
      dispatch({ type: "recordingStarted", now: Date.now(), speakingMs: task.speakingSeconds * 1000 });
      track("recording_started", { taskId, properties: { isRetry: Boolean(retryOfId), reRecord: true } });
    }
  }, [recorder, task.speakingSeconds, taskId, retryOfId, track]);

  const deadline = phase.kind === "preparing" || phase.kind === "recording" ? phase.endsAt : null;
  const remainingMs = useDeadline(deadline, () => {
    setEarlyWarning(false);
    if (phase.kind === "preparing") void startRecording(false);
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
      // Scoring…, then the result, at the attempt's own address: a reload or a link reopens it.
      router.push(`/result/${encodeURIComponent(attempt.id)}`);
    } catch (error) {
      const message = error instanceof ApiError ? error.userMessage : "Something went wrong while sending your answer.";
      track("upload_failed", { taskId, properties: { code: error instanceof ApiError ? error.code : "unknown" } });
      dispatch({ type: "uploadFailed", message });
    } finally {
      submittingRef.current = false;
    }
  }, [recorder, taskId, retryOfId, track, router]);
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

  const scoring = (status: AttemptView["status"] | null) => (
    <ScoringResult
      flags={flags}
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
            !isRetry && !historyLoading && <AttemptsCard attempts={history} />
          }
        />
      );
      break;
    }
    case "preparing":
      content = (
        <PracticeLayout
          task={taskCard(true)}
          step={<PreparationCard task={task} remainingMs={remainingMs} goal={goal} onSkip={() => void startRecording(true)} />}
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
        <UploadFailedCard message={phase.message} recording={recorder.recording} onRetry={() => void submit()} onReRecord={reRecord} />
      );
      break;
    case "processing":
    case "result":
    case "comparison":
      // The answer is sent: its result has its own address (/result/[id]), which the page is now opening.
      content = scoring(null);
      break;
  }

  return (
    <div className="space-y-4">
      {pageError && <InlineNotice title="Something went wrong.">{pageError}</InlineNotice>}
      {content}
    </div>
  );
}

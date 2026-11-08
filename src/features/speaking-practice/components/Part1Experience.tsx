"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DemoLabel } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import type { AttemptView } from "@/domain/speaking/attempt";
import type { QuestionSequenceTask } from "@/domain/speaking/question-sequence";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { useAudioLevel } from "../hooks/useAudioLevel";
import { useQuestionSequence, type QuestionSequenceResult, type SequenceFailure } from "../hooks/useQuestionSequence";
import { setAnalyticsSession, track as trackEvent } from "../lib/analytics";
import { ApiError, fetchAttempt, startSession, submitRecording } from "../lib/api-client";
import { demoScoringHref, retryGoalOf, type RetryGoal } from "../lib/practice-flow";
import { Part1BriefCard, Part1QuestionCard, Part1SendingCard, PicturesCard } from "./part1-screens";
import { InlineNotice, MicrophoneState, RetryGoalLoading, UploadFailedCard, type MicrophoneStateKind } from "./screens";

function newClientAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The Part 1.1 / 1.2 practice (docs/part1-plan.md §1): introduction → questions one by one in ONE recording (paused
 * during each question's audio and the chime) → upload with the question offsets → the attempt's result page. A retry
 * (?retry=<id>) shows its goal on every screen and is sent with the previous attempt's id.
 *
 * Mock mode (`mock`, ?mock=1): the real player and recorder run, nothing is sent (no session, analytics or upload);
 * after the last question the demo "Scoring…" opens, then this task's demo result (a retry is judged against its goal).
 */
export function Part1Experience({
  task,
  sequence,
  mock = null,
  initialRetryOf = null,
  retryAttemptId = null,
  timeScale = 1,
}: {
  task: PublicSpeakingTask;
  sequence: QuestionSequenceTask;
  mock?: { demoRetry: string | null } | null;
  initialRetryOf?: AttemptView | null;
  retryAttemptId?: string | null;
  /** Mock mode only, for browser tests: shortens every timing. */
  timeScale?: number;
}) {
  const [retryOf, setRetryOf] = useState<AttemptView | null>(initialRetryOf);
  const [goalLoading, setGoalLoading] = useState(Boolean(retryAttemptId) && !initialRetryOf);
  const [run, setRun] = useState(0);
  const isMock = mock !== null;

  // Opened from "Retry with this goal": load that attempt's goal (a failed load starts without it, never stuck).
  useEffect(() => {
    if (!retryAttemptId || initialRetryOf) return;
    let cancelled = false;
    const timer = setTimeout(() => !cancelled && setGoalLoading(false), 10_000);
    fetchAttempt(retryAttemptId)
      .then(({ attempt }) => !cancelled && attempt.evaluation && setRetryOf(attempt))
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        if (!cancelled) setGoalLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [retryAttemptId, initialRetryOf]);

  // One practice session per visit (real mode only), as on Part 2.
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isMock) return;
    let cancelled = false;
    startSession()
      .then(({ sessionId }) => {
        if (cancelled) return;
        sessionIdRef.current = sessionId;
        setAnalyticsSession(sessionId);
      })
      .catch(() => undefined);
    trackEvent("practice_opened", { taskId: task.id });
    return () => {
      cancelled = true;
    };
  }, [isMock, task.id]);

  return (
    <div className="space-y-4">
      {isMock && <DemoLabel variant="mode" className="bg-card" />}
      <Part1Run
        // "Try again" after a microphone problem, and "Practise without the goal", start a fresh run.
        key={run}
        task={task}
        sequence={sequence}
        goal={retryGoalOf(retryOf)}
        goalLoading={goalLoading}
        retryOfId={retryOf?.id ?? null}
        mock={mock}
        sessionIdRef={sessionIdRef}
        timeScale={isMock ? timeScale : 1}
        onDropGoal={retryOf ? () => setRetryOf(null) : undefined}
        onRestart={() => setRun((n) => n + 1)}
      />
    </div>
  );
}

const MIC_STATE: Record<SequenceFailure, MicrophoneStateKind> = {
  permission_denied: "permission_denied",
  no_microphone: "no_microphone",
  unsupported: "unsupported",
  recorder_failed: "recorder_failed",
  microphone_unavailable: "recorder_failed",
};

function Part1Run({
  task,
  sequence,
  goal,
  goalLoading,
  retryOfId,
  mock,
  sessionIdRef,
  timeScale,
  onDropGoal,
  onRestart,
}: {
  task: PublicSpeakingTask;
  sequence: QuestionSequenceTask;
  goal: RetryGoal | null;
  goalLoading: boolean;
  retryOfId: string | null;
  mock: { demoRetry: string | null } | null;
  sessionIdRef: React.RefObject<string | null>;
  timeScale: number;
  onDropGoal?: () => void;
  onRestart: () => void;
}) {
  const router = useRouter();
  const ready = useHydrated();
  const isMock = mock !== null;
  const track: typeof trackEvent = useCallback((...args) => (isMock ? undefined : trackEvent(...args)), [isMock]);
  const [upload, setUpload] = useState<{ kind: "sending" } | { kind: "failed"; message: string } | null>(null);
  const resultRef = useRef<(QuestionSequenceResult & { url: string; key: string }) | null>(null);
  // The same recording, for rendering "Download a copy" after a failed upload.
  const [saved, setSaved] = useState<{ url: string; mimeType: string } | null>(null);

  const send = useCallback(async () => {
    const result = resultRef.current;
    if (!result) return;
    setUpload({ kind: "sending" });
    try {
      const { attempt } = await submitRecording({
        taskId: task.id,
        sessionId: sessionIdRef.current,
        audio: result.recording.blob,
        durationMs: result.recording.durationMs,
        previousAttemptId: retryOfId,
        clientAttemptId: result.key,
        questionOffsetsMs: result.offsetsMs,
      });
      router.push(`/result/${encodeURIComponent(attempt.id)}`);
    } catch (error) {
      const message = error instanceof ApiError ? error.userMessage : "Something went wrong while sending your answer.";
      track("upload_failed", { taskId: task.id, properties: { code: error instanceof ApiError ? error.code : "unknown" } });
      setUpload({ kind: "failed", message });
    }
  }, [task.id, sessionIdRef, retryOfId, router, track]);

  const onFinished = useCallback(
    (result: QuestionSequenceResult) => {
      track("recording_completed", { taskId: task.id, properties: { durationMs: Math.round(result.recording.durationMs), mimeType: result.recording.mimeType } });
      if (mock) {
        // Mock mode: nothing is uploaded; the demo "Scoring…" takes over.
        router.push(demoScoringHref(task.id, retryOfId && mock.demoRetry ? mock.demoRetry : null));
        return;
      }
      const url = URL.createObjectURL(result.recording.blob);
      resultRef.current = { ...result, url, key: newClientAttemptId() };
      setSaved({ url, mimeType: result.recording.mimeType });
      void send();
    },
    [mock, router, task.id, retryOfId, send, track],
  );

  const onAudioFailure = useCallback(
    (failure: { index: number; cue: string; reason: string }) =>
      track("question_audio_failed", { taskId: task.id, properties: { question: failure.index + 1, cue: failure.cue, reason: failure.reason } }),
    [task.id, track],
  );

  const { state, phase, remainingMs, start, stream, recorderState } = useQuestionSequence({ task: sequence, timeScale, onFinished, onAudioFailure });
  const level = useAudioLevel(stream, phase.kind === "question" && phase.step.kind === "speaking");
  const audioFailedAt = useMemo(() => new Set(state.audioFailures.filter((f) => f.cue === "question").map((f) => f.index)), [state.audioFailures]);

  const begin = () => {
    start();
    if (retryOfId) track("retry_started", { taskId: task.id, attemptId: retryOfId });
    track("recording_started", { taskId: task.id, properties: { isRetry: Boolean(retryOfId) } });
  };

  // An unsent answer warns before the page is left.
  const unsent = phase.kind === "question" || (phase.kind === "finished" && upload?.kind !== "sending" && !isMock);
  useEffect(() => {
    if (!unsent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsent]);

  useEffect(() => {
    if (upload?.kind !== "failed") return;
    const resend = () => void send();
    window.addEventListener("online", resend);
    return () => window.removeEventListener("online", resend);
  }, [upload, send]);

  const failure = phase.kind === "failed" ? (MIC_STATE[phase.reason as SequenceFailure] ?? "recorder_failed") : null;
  useEffect(() => {
    if (failure) track("microphone_permission_denied", { taskId: task.id, properties: { reason: failure } });
  }, [failure, task.id, track]);

  if (phase.kind === "idle" || phase.kind === "failed") {
    return (
      <Part1BriefCard
        task={task}
        goal={goal}
        onStart={begin}
        onDropGoal={goal ? onDropGoal : undefined}
        ready={ready}
        microphone={goalLoading ? <RetryGoalLoading /> : failure ? <MicrophoneState kind={failure} onRetry={onRestart} /> : undefined}
      />
    );
  }

  if (phase.kind === "finished") {
    if (upload?.kind === "failed" && saved) {
      return (
        <div className="space-y-4">
          <InlineNotice title="Your answer wasn't sent.">Your recording is still here.</InlineNotice>
          <UploadFailedCard
            message={upload.message}
            recording={saved}
            onRetry={() => void send()}
            onReRecord={onRestart}
          />
        </div>
      );
    }
    return <Part1SendingCard task={task} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(19rem,0.8fr)_minmax(0,1fr)] lg:items-start">
      <Part1QuestionCard
        task={task}
        index={phase.index}
        step={phase.step}
        remainingMs={remainingMs}
        level={level}
        audioFailed={audioFailedAt.has(phase.index)}
        goal={goal}
        recorderState={recorderState}
      />
      <PicturesCard task={task} />
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DemoLabel } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import type { RecordingLock } from "@/domain/consent";
import type { PointId, PublicArgumentTask } from "@/domain/speaking/argument-task";
import { ScoringResult } from "@/features/result/sections";
import {
  InlineNotice,
  MicrophoneCard,
  MicrophoneState,
  PracticeLayout,
  RecordingLockedState,
  UploadFailedCard,
} from "@/features/speaking-practice/components/screens";
import { ApiError, submitRecording } from "@/features/speaking-practice/lib/api-client";
import { useAudioLevel } from "@/features/speaking-practice/hooks/useAudioLevel";
import { useAudioRecorder, type Recording } from "@/features/speaking-practice/hooks/useAudioRecorder";
import { useDeadline } from "@/features/speaking-practice/hooks/useDeadline";
import { playChime, primeChime, releaseChime } from "@/features/speaking-practice/lib/chime";
import { CuePlayer } from "@/features/speaking-practice/lib/cue-player";
import type { PartIntro } from "@/domain/speaking/question-sequence";
import { isEarlyFinish, type RetryGoal } from "@/features/speaking-practice/lib/practice-flow";
import { nextPart3Key, part3RealPracticeHref, part3ResultHref } from "./links";
import { Part3BriefCard, Part3IntroCard, Part3PreparationCard, Part3RecordingCard, StatementCard, canToggle } from "./screens";

type Phase =
  | { kind: "brief" }
  | { kind: "intro" }
  | { kind: "preparing"; endsAt: number }
  | { kind: "recording"; endsAt: number }
  | { kind: "sending" }
  | { kind: "uploadFailed"; message: string };

function newClientAttemptId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The Part 3 practice loop in mock mode, in the exam's order: brief → the spoken introduction on its own screen (what
 * the part is and the timings, read by the same offline voice as Part 1) → chime → the task with the one-minute
 * countdown (choose two points per side) → chime → two minutes of recording → chime when time is up → the demo result's "Scoring…" for the
 * points chosen. The chimes and the introduction are never recorded. The real recorder runs (so the microphone states
 * are real), but nothing is uploaded, no session or analytics is started, and no API is called.
 *
 * Real mode (`mode="real"`, only when `PART_LIVE["3"]` is on): the same screens, but Finish uploads the recording with
 * the chosen points (feedback only) and opens `/result/<attempt id>` (Scoring…, then the result). The consent lock is
 * decided on the server and refused again by the upload route. A failed upload keeps the recording in the tab.
 * A missing or blocked introduction file never stops the part: its text is on screen and the chime follows.
 */
export function Part3Practice({
  task,
  retryOf,
  goal,
  initialChosen,
  intro,
  timeScale = 1,
  mode = "mock",
  lock = null,
  retryAttemptId = null,
}: {
  task: PublicArgumentTask;
  /** "mock": `?mock=1`, nothing sent. "real": uploads and scores (the page only renders this when Part 3 is live). */
  mode?: "mock" | "real";
  /** Real mode: why this caller may not record (the brief shows it instead of Start). */
  lock?: RecordingLock | null;
  /** Real mode: the attempt this practice retries (its goal and points were loaded by the page). */
  retryAttemptId?: string | null;
  /** The spoken introduction (text and pre-generated audio). */
  intro: PartIntro;
  /** Mock mode only, for browser tests: shortens the preparation and speaking time (never the audio). */
  timeScale?: number;
  /** The demo key this is a retry of (its goal is shown on every screen). */
  retryOf: string | null;
  goal: RetryGoal | null;
  /** A retry starts with the points of the attempt it retries. */
  initialChosen: readonly PointId[];
}) {
  const router = useRouter();
  const ready = useHydrated();
  const recorder = useAudioRecorder();
  const [phase, setPhase] = useState<Phase>({ kind: "brief" });
  const [chosen, setChosen] = useState<PointId[]>([...initialChosen]);
  const [earlyWarning, setEarlyWarning] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const isReal = mode === "real";
  const level = useAudioLevel(recorder.stream, phase.kind === "recording");

  const prepMs = task.preparationSeconds * 1000 * timeScale;
  const speakMs = task.speakingSeconds * 1000 * timeScale;
  const cuePlayerRef = useRef<CuePlayer | null>(null);
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      cuePlayerRef.current?.stop();
      releaseChime();
    };
  }, []);

  const toggle = useCallback((id: PointId) => {
    setChosen((current) => (current.includes(id) ? current.filter((p) => p !== id) : canToggle(current, id) ? [...current, id] : current));
  }, []);

  // The "Start" tap: unlock sound (the introduction's audio element and the chime) and ask for the microphone at once.
  const startPart = useCallback(async () => {
    if (lock) return; // locked: the button is not shown, and nothing may start the microphone
    setPageError(null);
    primeChime();
    cuePlayerRef.current?.stop();
    const player = new CuePlayer(new Audio());
    cuePlayerRef.current = player;
    const spoken = player.play(intro.audio);
    if (!(await recorder.requestMicrophone())) {
      player.stop();
      return;
    }
    setPhase({ kind: "intro" });
    // The introduction, then the sample chime ("Start speaking when you hear this sound"), then the minute starts.
    const result = await spoken;
    if (unmountedRef.current || (!result.ok && result.reason === "superseded")) return;
    await playChime();
    if (unmountedRef.current) return;
    setPhase({ kind: "preparing", endsAt: Date.now() + prepMs });
  }, [lock, recorder, intro.audio, prepMs]);

  const startingRef = useRef(false);
  const startRecording = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    await playChime(); // the chime is never recorded
    startingRef.current = false;
    if (!recorder.start()) return;
    setPhase({ kind: "recording", endsAt: Date.now() + speakMs });
  }, [recorder, speakMs]);

  // One idempotency key per recording: sending the same audio again never creates a second attempt.
  const uploadKeyRef = useRef<{ blob: Blob; id: string } | null>(null);
  const submittingRef = useRef(false);
  const submit = useCallback(
    async (recording: Recording) => {
      if (submittingRef.current) return;
      if (uploadKeyRef.current?.blob !== recording.blob) uploadKeyRef.current = { blob: recording.blob, id: newClientAttemptId() };
      submittingRef.current = true;
      setPhase({ kind: "sending" });
      try {
        const { attempt } = await submitRecording({
          taskId: task.id,
          audio: recording.blob,
          durationMs: recording.durationMs,
          previousAttemptId: retryAttemptId,
          clientAttemptId: uploadKeyRef.current.id,
          chosenPoints: chosen,
        });
        recorder.discard();
        recorder.releaseStream();
        router.push(`/result/${encodeURIComponent(attempt.id)}`);
      } catch (error) {
        setPhase({ kind: "uploadFailed", message: error instanceof ApiError ? error.userMessage : "Something went wrong while sending your answer." });
      } finally {
        submittingRef.current = false;
      }
    },
    [recorder, router, task.id, retryAttemptId, chosen],
  );

  const finishingRef = useRef(false);
  /** `timeUp`: the two minutes ran out, so the chime sounds again (after the recorder stopped), as in the exam. */
  const finish = useCallback(async (timeUp = false) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setEarlyWarning(false);
    setPhase({ kind: "sending" });
    const recording = await recorder.stop();
    if (timeUp) await playChime();
    finishingRef.current = false;
    if (isReal) {
      if (!recording) {
        setPageError("Your recording didn't save. Check your microphone and try again.");
        recorder.discard();
        setPhase({ kind: "brief" });
        return;
      }
      void submit(recording);
      return;
    }
    // Mock mode: nothing is uploaded. The microphone goes off and the demo "Scoring…" takes over.
    recorder.discard();
    recorder.releaseStream();
    router.push(part3ResultHref(nextPart3Key(task.id, chosen, retryOf), { scoring: true }));
  }, [recorder, router, task.id, chosen, retryOf, isReal, submit]);

  const deadline = phase.kind === "preparing" || phase.kind === "recording" ? phase.endsAt : null;
  const remainingMs = useDeadline(deadline, () => {
    if (phase.kind === "preparing") void startRecording();
    else if (phase.kind === "recording") void finish(true);
  });

  const requestFinish = () => {
    if (isEarlyFinish(speakMs - remainingMs, speakMs / 1000)) setEarlyWarning(true);
    else void finish();
  };

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [phase.kind]);

  // Real mode: leaving while the answer is being recorded or not yet sent would lose it.
  const hasUnsent = isReal && (phase.kind === "recording" || phase.kind === "sending" || phase.kind === "uploadFailed");
  useEffect(() => {
    if (!hasUnsent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsent]);

  // An upload that failed because the device went offline is sent again as soon as it is back online.
  useEffect(() => {
    if (phase.kind !== "uploadFailed" || !recorder.recording) return;
    const recording = recorder.recording;
    const resend = () => void submit(recording);
    window.addEventListener("online", resend);
    return () => window.removeEventListener("online", resend);
  }, [phase.kind, recorder.recording, submit]);

  const micError = recorder.status === "error" ? recorder.error : null;
  const retryMicrophone = () => {
    recorder.discard();
    setPhase({ kind: "brief" });
    void startPart();
  };

  let content: React.ReactNode;
  if (micError && phase.kind !== "brief") {
    content = <PracticeLayout task={<StatementCard task={task} chosen={chosen} />} step={<MicrophoneCard kind={micError} onRetry={retryMicrophone} />} />;
  } else if (phase.kind === "brief") {
    const microphone = lock ? (
      <RecordingLockedState lock={lock} mock={!isReal} signInNext={part3RealPracticeHref(task.id)} />
    ) : recorder.status === "requesting" ? (
        <MicrophoneState kind="asking" onRetry={retryMicrophone} />
      ) : micError ? (
        <MicrophoneState kind={micError} onRetry={retryMicrophone} />
      ) : undefined;
    content = (
      <PracticeLayout
        task={<StatementCard task={task} chosen={chosen} />}
        step={<Part3BriefCard task={task} goal={goal} onStart={startPart} ready={ready} microphone={microphone} />}
      />
    );
  } else if (phase.kind === "intro") {
    // As in the exam: the introduction on its own; the statement and lists appear with the minute of preparation.
    content = <Part3IntroCard text={intro.text} goal={goal} />;
  } else if (phase.kind === "preparing") {
    content = (
      <PracticeLayout
        task={<StatementCard task={task} chosen={chosen} onToggle={toggle} />}
        step={<Part3PreparationCard totalMs={prepMs} remainingMs={remainingMs} chosen={chosen} goal={goal} onSkip={() => void startRecording()} />}
      />
    );
  } else if (phase.kind === "uploadFailed") {
    content = (
      <UploadFailedCard
        message={phase.message}
        recording={recorder.recording}
        onRetry={() => recorder.recording && void submit(recorder.recording)}
        onReRecord={() => {
          recorder.discard();
          setPhase({ kind: "brief" });
        }}
      />
    );
  } else if (isReal && phase.kind === "sending") {
    content = (
      <ScoringResult
        state={{ kind: "scoring", task: { id: task.id, title: task.title, part: 3, prompts: [] }, step: "saved", transcript: null, durationMs: recorder.recording?.durationMs ?? 0, goal: goal?.objective ?? null }}
      />
    );
  } else {
    content = (
      <PracticeLayout
        task={<StatementCard task={task} chosen={chosen} />}
        step={
          <Part3RecordingCard
            totalMs={speakMs}
            remainingMs={phase.kind === "recording" ? remainingMs : 0}
            level={level}
            chosen={chosen}
            goal={goal}
            earlyWarning={earlyWarning}
            onFinish={requestFinish}
            onKeepSpeaking={() => setEarlyWarning(false)}
            onFinishAnyway={() => void finish()}
          />
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {!isReal && <DemoLabel variant="mode" className="bg-card" />}
      {pageError && <InlineNotice title="Something went wrong.">{pageError}</InlineNotice>}
      {content}
    </div>
  );
}

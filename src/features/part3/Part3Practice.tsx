"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DemoLabel } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import type { PointId, PublicArgumentTask } from "@/domain/speaking/argument-task";
import { MicrophoneCard, MicrophoneState, PracticeLayout } from "@/features/speaking-practice/components/screens";
import { useAudioLevel } from "@/features/speaking-practice/hooks/useAudioLevel";
import { useAudioRecorder } from "@/features/speaking-practice/hooks/useAudioRecorder";
import { useDeadline } from "@/features/speaking-practice/hooks/useDeadline";
import { playChime, primeChime } from "@/features/speaking-practice/lib/chime";
import { CuePlayer } from "@/features/speaking-practice/lib/cue-player";
import type { PartIntro } from "@/domain/speaking/question-sequence";
import { isEarlyFinish, type RetryGoal } from "@/features/speaking-practice/lib/practice-flow";
import { nextPart3Key, part3ResultHref } from "./links";
import { Part3BriefCard, Part3IntroCard, Part3PreparationCard, Part3RecordingCard, StatementCard, canToggle } from "./screens";

type Phase =
  | { kind: "brief" }
  | { kind: "intro" }
  | { kind: "preparing"; endsAt: number }
  | { kind: "recording"; endsAt: number }
  | { kind: "sending" };

/**
 * The Part 3 practice loop in mock mode, in the exam's order: brief → the spoken introduction (the statement and the
 * timings, read by the same offline voice as Part 1) and the sample chime → one minute of preparation (choose two
 * points per side) → chime → two minutes of recording → chime when time is up → the demo result's "Scoring…" for the
 * points chosen. The chimes and the introduction are never recorded. The real recorder runs (so the microphone states
 * are real), but nothing is uploaded, no session or analytics is started, and no API is called. Part 3 has no real
 * flow yet. A missing or blocked introduction file never stops the part: its text is on screen and the chime follows.
 */
export function Part3Practice({
  task,
  retryOf,
  goal,
  initialChosen,
  intro,
  timeScale = 1,
}: {
  task: PublicArgumentTask;
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
    };
  }, []);

  const toggle = useCallback((id: PointId) => {
    setChosen((current) => (current.includes(id) ? current.filter((p) => p !== id) : canToggle(current, id) ? [...current, id] : current));
  }, []);

  // The "Start" tap: unlock sound (the introduction's audio element and the chime) and ask for the microphone at once.
  const startPart = useCallback(async () => {
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
  }, [recorder, intro.audio, prepMs]);

  const startingRef = useRef(false);
  const startRecording = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    await playChime(); // the chime is never recorded
    startingRef.current = false;
    if (!recorder.start()) return;
    setPhase({ kind: "recording", endsAt: Date.now() + speakMs });
  }, [recorder, speakMs]);

  const finishingRef = useRef(false);
  /** `timeUp`: the two minutes ran out, so the chime sounds again (after the recorder stopped), as in the exam. */
  const finish = useCallback(async (timeUp = false) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setEarlyWarning(false);
    setPhase({ kind: "sending" });
    await recorder.stop();
    if (timeUp) await playChime();
    // Mock mode: nothing is uploaded. The microphone goes off and the demo "Scoring…" takes over.
    recorder.discard();
    recorder.releaseStream();
    router.push(part3ResultHref(nextPart3Key(task.id, chosen, retryOf), { scoring: true }));
  }, [recorder, router, task.id, chosen, retryOf]);

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
    const microphone =
      recorder.status === "requesting" ? (
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
    content = <PracticeLayout task={<StatementCard task={task} chosen={chosen} />} step={<Part3IntroCard text={intro.text} goal={goal} />} />;
  } else if (phase.kind === "preparing") {
    content = (
      <PracticeLayout
        task={<StatementCard task={task} chosen={chosen} onToggle={toggle} />}
        step={<Part3PreparationCard totalMs={prepMs} remainingMs={remainingMs} chosen={chosen} goal={goal} onSkip={() => void startRecording()} />}
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
      <DemoLabel variant="mode" className="bg-card" />
      {content}
    </div>
  );
}

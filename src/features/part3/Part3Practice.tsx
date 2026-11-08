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
import { isEarlyFinish, type RetryGoal } from "@/features/speaking-practice/lib/practice-flow";
import { nextPart3Key, part3ResultHref } from "./links";
import { Part3BriefCard, Part3PreparationCard, Part3RecordingCard, StatementCard, canToggle } from "./screens";

type Phase = { kind: "brief" } | { kind: "preparing"; endsAt: number } | { kind: "recording"; endsAt: number } | { kind: "sending" };

/**
 * The Part 3 practice loop in mock mode: brief → preparation (choose two points per side) → recording → Finish opens
 * the demo result's "Scoring…" for the points chosen. The real recorder runs (so the microphone states are real),
 * but nothing is uploaded, no session or analytics is started, and no API is called. Part 3 has no real flow yet.
 */
export function Part3Practice({
  task,
  retryOf,
  goal,
  initialChosen,
}: {
  task: PublicArgumentTask;
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

  const toggle = useCallback((id: PointId) => {
    setChosen((current) => (current.includes(id) ? current.filter((p) => p !== id) : canToggle(current, id) ? [...current, id] : current));
  }, []);

  const startPreparation = useCallback(async () => {
    primeChime(); // inside the click, so the chime may play when preparation runs out
    if (!(await recorder.requestMicrophone())) return;
    setPhase({ kind: "preparing", endsAt: Date.now() + task.preparationSeconds * 1000 });
  }, [recorder, task.preparationSeconds]);

  const startingRef = useRef(false);
  const startRecording = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    await playChime(); // the chime is never recorded
    startingRef.current = false;
    if (!recorder.start()) return;
    setPhase({ kind: "recording", endsAt: Date.now() + task.speakingSeconds * 1000 });
  }, [recorder, task.speakingSeconds]);

  const finishingRef = useRef(false);
  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setEarlyWarning(false);
    setPhase({ kind: "sending" });
    await recorder.stop();
    // Mock mode: nothing is uploaded. The microphone goes off and the demo "Scoring…" takes over.
    recorder.discard();
    recorder.releaseStream();
    router.push(part3ResultHref(nextPart3Key(task.id, chosen, retryOf), { scoring: true }));
  }, [recorder, router, task.id, chosen, retryOf]);

  const deadline = phase.kind === "preparing" || phase.kind === "recording" ? phase.endsAt : null;
  const remainingMs = useDeadline(deadline, () => {
    if (phase.kind === "preparing") void startRecording();
    else if (phase.kind === "recording") void finish();
  });

  const requestFinish = () => {
    if (isEarlyFinish(task.speakingSeconds * 1000 - remainingMs, task.speakingSeconds)) setEarlyWarning(true);
    else void finish();
  };

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [phase.kind]);

  const micError = recorder.status === "error" ? recorder.error : null;
  const retryMicrophone = () => {
    recorder.discard();
    setPhase({ kind: "brief" });
    void startPreparation();
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
        step={<Part3BriefCard task={task} goal={goal} onStart={startPreparation} ready={ready} microphone={microphone} />}
      />
    );
  } else if (phase.kind === "preparing") {
    content = (
      <PracticeLayout
        task={<StatementCard task={task} chosen={chosen} onToggle={toggle} />}
        step={<Part3PreparationCard task={task} remainingMs={remainingMs} chosen={chosen} goal={goal} onSkip={() => void startRecording()} />}
      />
    );
  } else {
    content = (
      <PracticeLayout
        task={<StatementCard task={task} chosen={chosen} />}
        step={
          <Part3RecordingCard
            task={task}
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

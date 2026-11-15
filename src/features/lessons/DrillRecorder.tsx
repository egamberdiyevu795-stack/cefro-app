"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, PillAction } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import { RecordingPlayer } from "@/features/speaking-practice/components/RecordingPlayer";
import { useAudioRecorder, type RecorderErrorKind } from "@/features/speaking-practice/hooks/useAudioRecorder";

const ERROR_TEXT: Record<RecorderErrorKind, string> = {
  permission_denied: "Microphone blocked. Allow it in your browser to record, or say it aloud.",
  no_microphone: "No microphone found. Say it aloud instead.",
  unsupported: "This browser can't record here. Say it aloud instead.",
  recorder_failed: "Recording didn't work. Try again, or say it aloud.",
};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** "Answer, then add…" → "answer, then add…": the approved instruction, read after "Did you:". */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** The self-check question for a prompt, from its own approved instruction only. */
export function selfCheckText(check: readonly string[]): string {
  return `Listen back. Did you: ${check.map(lowerFirst).join("; ")}?`;
}

export type SelfCheck = "none" | "yes" | "not_yet";

/**
 * Record one drill prompt, listen back, then the self-check: "Listen back. Did you: …?" with Yes / Not yet. Yes marks
 * the prompt done; Not yet says "Try once more" and keeps "Record again". The recording and the answers stay in this
 * page (never saved or uploaded) and are gone when it closes. Quiet buttons only: the screen's one black button is
 * the retry. A new recording asks again.
 */
export function DrillRecorder({
  seconds,
  label,
  check,
  answer,
  onAnswer,
}: {
  seconds: number;
  label: string;
  check: readonly string[];
  answer: SelfCheck;
  onAnswer: (answer: SelfCheck) => void;
}) {
  const hydrated = useHydrated();
  const recorder = useAudioRecorder();
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { status, recording, error, stop, releaseStream } = recorder;

  useEffect(() => {
    if (status !== "recording") return;
    const startedAt = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(s);
      if (s >= seconds) void stop().then(() => releaseStream());
    }, 250);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [status, seconds, stop, releaseStream]);

  const startRecording = async () => {
    recorder.discard();
    setElapsed(0);
    onAnswer("none");
    if (await recorder.requestMicrophone()) recorder.start();
  };

  if (status === "recording") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <PillAction onClick={() => void stop().then(() => releaseStream())} variant="quiet" size="sm" icon="stop">
          Stop
        </PillAction>
        <span role="timer" aria-live="off" className="text-label text-fg">
          Recording {clock(Math.min(elapsed, seconds))} / {clock(seconds)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {recording && <RecordingPlayer src={recording.url} durationMs={recording.durationMs} label={`Your recording: ${label}`} />}
      {recording && answer !== "yes" && (
        <div className="rounded-tile bg-well p-3" data-testid="self-check">
          <p className="text-body text-fg">{selfCheckText(check)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <PillAction onClick={() => onAnswer("yes")} variant="light" size="sm" icon="check">
              Yes
            </PillAction>
            <PillAction onClick={() => onAnswer("not_yet")} variant="light" size="sm">
              Not yet
            </PillAction>
          </div>
          {answer === "not_yet" && (
            <p role="status" className="mt-2 text-label text-fg">
              Try once more
            </p>
          )}
        </div>
      )}
      {answer === "yes" && (
        <p role="status" className="inline-flex items-center gap-1.5 text-label font-medium text-fg" data-testid="prompt-done">
          <Icon name="check" size={14} className="text-fg-subtle" />
          Done
        </p>
      )}
      <div>
        <PillAction onClick={() => void startRecording()} variant="quiet" size="sm" icon="mic" disabled={!hydrated || status === "requesting"}>
          {recording ? "Record again" : "Record"}
        </PillAction>
      </div>
      {error && (
        <p role="status" className="text-label text-fg">
          {ERROR_TEXT[error]}
        </p>
      )}
    </div>
  );
}

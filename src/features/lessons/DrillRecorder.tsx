"use client";

import { useEffect, useRef, useState } from "react";
import { PillAction } from "@/components/ds";
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

/**
 * Record one drill prompt and listen back (self-check only: the recording stays in this browser, it is never uploaded
 * or scored). Stops by itself at the prompt's time. Quiet buttons only: the screen's one black button is the retry.
 */
export function DrillRecorder({ seconds, label }: { seconds: number; label: string }) {
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

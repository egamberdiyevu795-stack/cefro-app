"use client";

import { useEffect, useState } from "react";
import { PillAction } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import { RecordingPlayer } from "@/features/speaking-practice/components/RecordingPlayer";
import { useAudioRecorder, type RecorderErrorKind } from "@/features/speaking-practice/hooks/useAudioRecorder";

/** The longest check recording. */
export const MIC_CHECK_SECONDS = 3;

export const MIC_CHECK_ERRORS: Record<RecorderErrorKind, string> = {
  permission_denied:
    "Your microphone is blocked for CEFRO. Allow the microphone for this site in your browser's settings (the icon next to the address), then try again.",
  no_microphone: "No microphone was found. Connect one, then try again.",
  unsupported: "This browser can't record here. Try the latest Chrome, Safari or Firefox.",
  recorder_failed: "The recording didn't work. Try again.",
};

/**
 * "Check microphone", on the practice brief before Start preparation: record up to 3 s, then play it back. The
 * recording stays in this page (a blob URL in the browser): nothing is saved or uploaded, and it is gone when the page
 * closes. The microphone is released as soon as the recording stops, and when the brief closes (Start preparation).
 * Grey controls only: Start preparation stays the screen's one black button.
 */
export function MicCheck({ ready: pageReady = true }: { ready?: boolean }) {
  const ready = useHydrated() && pageReady;
  const recorder = useAudioRecorder();
  const { status, recording, error, stop, releaseStream } = recorder;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== "recording") return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const s = Math.min(MIC_CHECK_SECONDS, Math.floor((Date.now() - startedAt) / 1000));
      setElapsed(s);
      if (Date.now() - startedAt >= MIC_CHECK_SECONDS * 1000) void stop().then(() => releaseStream());
    }, 100);
    return () => clearInterval(timer);
  }, [status, stop, releaseStream]);

  async function check() {
    recorder.discard();
    setElapsed(0);
    if (await recorder.requestMicrophone()) recorder.start();
  }

  return (
    <div className="flex flex-col gap-2" data-testid="mic-check">
      {status === "recording" ? (
        <div className="flex flex-wrap items-center gap-3">
          <PillAction onClick={() => void stop().then(() => releaseStream())} variant="quiet" icon="stop">
            Stop
          </PillAction>
          <span role="timer" aria-live="off" className="text-label text-fg">
            Recording 0:0{elapsed} / 0:0{MIC_CHECK_SECONDS}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <PillAction onClick={() => void check()} variant="quiet" icon="mic" disabled={!ready || status === "requesting"} className="disabled:cursor-wait">
            {recording ? "Check again" : "Check microphone"}
          </PillAction>
          <span className="text-label text-fg-muted">Up to {MIC_CHECK_SECONDS} s, then listen back. Nothing is saved or uploaded.</span>
        </div>
      )}
      {recording && status !== "recording" && (
        <div className="flex flex-col gap-1">
          <p className="text-label text-fg">Listen back. Can you hear yourself clearly?</p>
          <RecordingPlayer src={recording.url} durationMs={recording.durationMs} label="Your microphone check" />
        </div>
      )}
      {error && (
        <p role="alert" className="text-label text-fg" data-testid="mic-error">
          {MIC_CHECK_ERRORS[error]}
        </p>
      )}
    </div>
  );
}

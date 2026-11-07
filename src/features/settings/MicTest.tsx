"use client";

import { useEffect, useState } from "react";
import { PillAction } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import { RecordingPlayer } from "@/features/speaking-practice/components/RecordingPlayer";
import { useAudioRecorder, type RecorderErrorKind } from "@/features/speaking-practice/hooks/useAudioRecorder";

/** The longest test recording. */
export const MIC_TEST_SECONDS = 3;

export const MIC_TEST_ERRORS: Record<RecorderErrorKind, string> = {
  permission_denied:
    "Your microphone is blocked for CEFRO. Allow the microphone for this site in your browser's settings (the icon next to the address), then try again.",
  no_microphone: "No microphone was found. Connect one, then try again.",
  unsupported: "This browser can't record here. Try the latest Chrome, Safari or Firefox.",
  recorder_failed: "The recording didn't work. Try again.",
};

/**
 * "Test your microphone": record up to 3 s, then play it back. The recording stays in this page (a blob URL in the
 * browser): nothing is saved or uploaded, and it is gone when the page closes. The microphone is released as soon
 * as the recording stops. This is the page's one black control (Test microphone / Stop / Test again).
 */
export function MicTest() {
  const ready = useHydrated();
  const recorder = useAudioRecorder();
  const { status, recording, error, stop, releaseStream } = recorder;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== "recording") return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const s = Math.min(MIC_TEST_SECONDS, Math.floor((Date.now() - startedAt) / 1000));
      setElapsed(s);
      if (Date.now() - startedAt >= MIC_TEST_SECONDS * 1000) void stop().then(() => releaseStream());
    }, 100);
    return () => clearInterval(timer);
  }, [status, stop, releaseStream]);

  async function test() {
    recorder.discard();
    setElapsed(0);
    if (await recorder.requestMicrophone()) recorder.start();
  }

  return (
    <div className="flex flex-col gap-3" data-testid="mic-test">
      <p className="text-body text-fg-muted">
        Record {MIC_TEST_SECONDS} seconds and listen back. Nothing is saved or uploaded.
      </p>
      {status === "recording" ? (
        <div className="flex flex-wrap items-center gap-3">
          <PillAction onClick={() => void stop().then(() => releaseStream())} icon="stop">
            Stop
          </PillAction>
          <span role="timer" aria-live="off" className="text-label text-fg">
            Recording 0:0{elapsed} / 0:0{MIC_TEST_SECONDS}
          </span>
        </div>
      ) : (
        <div>
          <PillAction onClick={() => void test()} icon="mic" disabled={!ready || status === "requesting"}>
            {recording ? "Test again" : "Test microphone"}
          </PillAction>
        </div>
      )}
      {recording && status !== "recording" && (
        <div className="flex flex-col gap-1">
          <p className="text-label text-fg">Listen back. Can you hear yourself clearly?</p>
          <RecordingPlayer src={recording.url} durationMs={recording.durationMs} label="Your microphone test" />
        </div>
      )}
      {error && (
        <p role="alert" className="text-label text-fg" data-testid="mic-error">
          {MIC_TEST_ERRORS[error]}
        </p>
      )}
    </div>
  );
}

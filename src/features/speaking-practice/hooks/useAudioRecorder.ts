"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "requesting" | "ready" | "recording" | "stopped" | "error";
export type RecorderErrorKind = "permission_denied" | "no_microphone" | "unsupported" | "recorder_failed";

export interface Recording {
  blob: Blob;
  url: string;
  mimeType: string;
  durationMs: number;
}

/** Preferred formats, best first. Chrome/Firefox use WebM/Opus, Safari uses MP4/AAC. */
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/**
 * Speech needs far less than the browser default (often 128 kbps): at 32 kbps a 2-minute answer is about 0.5 MB
 * instead of about 2 MB, so it uploads several times faster on a slow mobile connection. Opus and AAC both keep
 * speech clearly intelligible at this rate. A browser that ignores the hint simply records at its default.
 */
const AUDIO_BITS_PER_SECOND = 32_000;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/**
 * Microphone recording with MediaRecorder.
 *
 * Audio is collected in 1-second chunks so that most of a recording survives
 * if the recorder fails part-way. The microphone stream is kept open between
 * takes (so re-recording doesn't ask permission again) and released on unmount.
 */
export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<RecorderErrorKind | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stopResolverRef = useRef<((recording: Recording | null) => void) | null>(null);
  const urlRef = useRef<string | null>(null);

  const fail = useCallback((kind: RecorderErrorKind, cause?: unknown) => {
    if (cause) console.error("[cefro] recorder error", kind, cause);
    setError(kind);
    setStatus("error");
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  /** Ask for microphone access. Resolves true when the microphone is ready. */
  const requestMicrophone = useCallback(async (): Promise<boolean> => {
    if (streamRef.current?.active) {
      setStatus("ready");
      return true;
    }
    if (!isRecordingSupported()) {
      fail("unsupported");
      return false;
    }
    setStatus("requesting");
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = media;
      setStream(media);
      setStatus("ready");
      return true;
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") fail("permission_denied", cause);
      else if (name === "NotFoundError" || name === "OverconstrainedError") fail("no_microphone", cause);
      else fail("recorder_failed", cause);
      return false;
    }
  }, [fail]);

  const start = useCallback((): boolean => {
    const media = streamRef.current;
    if (!media?.active) {
      fail("recorder_failed", new Error("Microphone stream is not active"));
      return false;
    }
    try {
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(media, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = (event) => fail("recorder_failed", event);
      recorder.onstop = () => {
        const durationMs = performance.now() - startedAtRef.current;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        let result: Recording | null = null;
        if (blob.size > 0) {
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          result = { blob, url, mimeType: type, durationMs };
          setRecording(result);
          setStatus("stopped");
        } else {
          fail("recorder_failed", new Error("Recorder produced no audio"));
        }
        stopResolverRef.current?.(result);
        stopResolverRef.current = null;
      };
      recorder.start(1000);
      startedAtRef.current = performance.now();
      recorderRef.current = recorder;
      setRecording(null);
      setError(null);
      setStatus("recording");
      return true;
    } catch (cause) {
      fail("recorder_failed", cause);
      return false;
    }
  }, [fail]);

  /** Stop recording. Resolves with the finished recording (or null on failure). */
  const stop = useCallback((): Promise<Recording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      stopResolverRef.current = resolve;
      recorder.stop();
    });
  }, []);

  /** Throw away the current take (e.g. to record again) and clear any error. */
  const discard = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setRecording(null);
    setError(null);
    setStatus(streamRef.current?.active ? "ready" : "idle");
  }, []);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return { status, error, stream, recording, requestMicrophone, start, stop, discard, releaseStream };
}

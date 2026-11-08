"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { QuestionSequenceTask } from "@/domain/speaking/question-sequence";
import { playChime, primeChime } from "../lib/chime";
import { CuePlayer, type CueResult } from "../lib/cue-player";
import { PausableRecorder, type PausedRecording } from "../lib/pausable-recorder";
import { createSequenceState, cueFor, sequenceReducer, type AudioCue, type AudioFailure } from "../lib/question-sequence-machine";
import { useDeadline } from "./useDeadline";

export interface QuestionSequenceResult {
  recording: PausedRecording;
  /** Start of each question's speaking window in recording time: `[0, t2, t3]`. */
  offsetsMs: number[];
  audioFailures: AudioFailure[];
}

export type RecorderState = "inactive" | "recording" | "paused";

/**
 * Why a part stopped: the microphone could not be used ("permission_denied", "no_microphone", "unsupported") or the
 * recorder failed ("recorder_failed"). "microphone_unavailable" is kept for a microphone that went away later.
 */
export type SequenceFailure = "permission_denied" | "no_microphone" | "unsupported" | "recorder_failed" | "microphone_unavailable";

function microphoneFailure(cause: unknown): SequenceFailure {
  const name = cause instanceof DOMException ? cause.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission_denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no_microphone";
  return "recorder_failed";
}

/**
 * A Part 1 task question by question inside one recording (docs/part1-plan.md §1): question text + audio → chime →
 * countdown → chime (time is up) → next question, automatically, with the recorder PAUSED while the question audio and the chime play, so
 * the one file holds only the student's speech.
 *
 * `start()` must run inside the student's tap: it creates and first plays the audio element (unlocking audio for the
 * whole part) and asks for the microphone at the same moment. Failed or stuck audio never blocks the part: a failed
 * question audio still plays the chime, the chime (made in code) always settles, and each failure is reported.
 * Timings come from the task; `timeScale` exists for the dev page's browser tests only.
 */
export function useQuestionSequence({
  task,
  timeScale = 1,
  onFinished,
  onAudioFailure,
}: {
  task: QuestionSequenceTask;
  timeScale?: number;
  onFinished: (result: QuestionSequenceResult) => void;
  onAudioFailure?: (failure: AudioFailure) => void;
}) {
  const [state, dispatch] = useReducer(sequenceReducer, { questions: task.questions, timeScale, hasIntro: Boolean(task.intro) }, createSequenceState);
  const [recorderState, setRecorderState] = useState<RecorderState>("inactive");
  const [stream, setStream] = useState<MediaStream | null>(null);

  const cuePlayerRef = useRef<CuePlayer | null>(null);
  const playingKeyRef = useRef<string | null>(null);
  const recorderRef = useRef<Promise<PausableRecorder | null> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unmountedRef = useRef(false);
  const callbacksRef = useRef({ onFinished, onAudioFailure });
  useEffect(() => {
    callbacksRef.current = { onFinished, onAudioFailure };
  });

  const { phase } = state;

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const requestRecorder = useCallback((): Promise<PausableRecorder | null> => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      dispatch({ type: "fail", reason: "unsupported" });
      return Promise.resolve(null);
    }
    return navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((media) => {
        streamRef.current = media;
        setStream(media);
        return new PausableRecorder(media, { onError: (reason) => dispatch({ type: "fail", reason }) });
      })
      .catch((cause: unknown) => {
        console.error("[cefro] microphone error", cause);
        dispatch({ type: "fail", reason: microphoneFailure(cause) });
        return null;
      });
  }, []);

  const handleCueEnded = useCallback(async (index: number, cue: AudioCue, result: CueResult) => {
    if (unmountedRef.current || (!result.ok && result.reason === "superseded")) return;
    if (!result.ok) callbacksRef.current.onAudioFailure?.({ index, cue, reason: result.reason });
    if (cue === "question") {
      dispatch(
        result.ok
          ? { type: "promptEnded", index, now: Date.now(), ok: true }
          : { type: "promptEnded", index, now: Date.now(), ok: false, reason: result.reason },
      );
      return;
    }
    // Chime over: start (first question) or resume the recorder, then start the countdown.
    const recorder = await recorderRef.current;
    if (unmountedRef.current) return;
    if (!recorder) {
      dispatch({ type: "fail", reason: "microphone_unavailable" });
      return;
    }
    let recordingMs: number;
    try {
      recordingMs = recorder.record();
    } catch (cause) {
      console.error("[cefro] recorder error", cause);
      dispatch({ type: "fail", reason: "recorder_failed" });
      return;
    }
    setRecorderState(recorder.state);
    dispatch({ type: "speakingStarted", index, now: Date.now(), recordingMs, chime: result.ok ? { ok: true } : { ok: false, reason: result.reason } });
  }, []);

  const playCue = useCallback(
    (index: number, cue: AudioCue) => {
      const key = `${index}:${cue}`;
      const player = cuePlayerRef.current;
      if (!player || playingKeyRef.current === key) return;
      playingKeyRef.current = key;
      if (cue === "intro") {
        // The spoken introduction, then the sample chime ("start speaking when you hear this sound"). Never recorded.
        void player.play(task.intro!.audio).then(async (result) => {
          if (!result.ok && result.reason === "superseded") return;
          if (!result.ok) callbacksRef.current.onAudioFailure?.({ index: 0, cue: "intro", reason: result.reason });
          await playChime();
          if (!unmountedRef.current) dispatch({ type: "introEnded", failure: result.ok ? undefined : result.reason });
        });
        return;
      }
      if (cue === "chime") {
        // The same two-tone chime as Part 2, made in code (no file). It never fails; it only settles.
        void playChime().then(() => handleCueEnded(index, cue, { ok: true }));
        return;
      }
      void player.play(task.questions[index]!.audio).then((result) => handleCueEnded(index, cue, result));
    },
    [task, handleCueEnded],
  );

  const start = useCallback(() => {
    // Everything that needs the student's tap happens here.
    cuePlayerRef.current = new CuePlayer(new Audio());
    primeChime();
    recorderRef.current = requestRecorder();
    playCue(0, task.intro ? "intro" : "question");
    dispatch({ type: "start" });
  }, [requestRecorder, playCue, task.intro]);

  // Play the cue the current step needs (the first one was already started by the tap).
  useEffect(() => {
    const cue = cueFor(phase);
    if (cue) playCue(cue.index, cue.cue);
  }, [phase, playCue]);

  // End of preparation / speaking. The recorder is paused here, before the next question's audio starts.
  const deadline = phase.kind === "question" && "endsAt" in phase.step ? phase.step.endsAt : null;
  useEffect(() => {
    if (phase.kind !== "question" || deadline === null) return;
    const { index, step } = phase;
    const id = window.setTimeout(() => {
      if (step.kind === "speaking") {
        void recorderRef.current?.then(async (recorder) => {
          recorder?.pause();
          if (recorder) setRecorderState(recorder.state);
          // Time is up: the chime again (as in the exam), after the recorder paused, before the next question.
          await playChime();
          if (!unmountedRef.current) dispatch({ type: "speakingExpired", index });
        });
      } else {
        dispatch({ type: "preparationExpired", index });
      }
    }, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(id);
  }, [phase, deadline]);
  const remainingMs = useDeadline(deadline, () => {});

  // Finished: one recording file with the offsets.
  useEffect(() => {
    if (phase.kind !== "finished") return;
    cuePlayerRef.current?.stop();
    const offsetsMs = state.offsetsMs;
    const audioFailures = state.audioFailures;
    void recorderRef.current?.then(async (recorder) => {
      const recording = await recorder?.stop();
      setRecorderState("inactive");
      releaseStream();
      if (unmountedRef.current) return;
      if (!recording) {
        dispatch({ type: "fail", reason: "recorder_failed" });
        return;
      }
      callbacksRef.current.onFinished({ recording, offsetsMs, audioFailures });
    });
  }, [phase.kind, state.offsetsMs, state.audioFailures, releaseStream]);

  useEffect(() => {
    if (phase.kind !== "failed") return;
    cuePlayerRef.current?.stop();
    void recorderRef.current?.then((recorder) => recorder?.stop()).finally(() => {
      setRecorderState("inactive");
      releaseStream();
    });
  }, [phase.kind, releaseStream]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      cuePlayerRef.current?.stop();
      void recorderRef.current?.then((recorder) => recorder?.stop());
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { state, phase, recorderState, remainingMs, start, stream };
}

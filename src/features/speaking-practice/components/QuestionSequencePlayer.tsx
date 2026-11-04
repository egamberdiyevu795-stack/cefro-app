"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { QuestionSequenceTask } from "@/domain/speaking/question-sequence";
import { useDeadline } from "../hooks/useDeadline";
import { CuePlayer, type CueResult } from "../lib/cue-player";
import { PausableRecorder, type PausedRecording } from "../lib/pausable-recorder";
import {
  createSequenceState,
  cueFor,
  sequenceReducer,
  type AudioCue,
  type AudioFailure,
} from "../lib/question-sequence-machine";
import { CountdownRing } from "./CountdownRing";

export interface QuestionSequenceResult {
  recording: PausedRecording;
  /** Start of each question's speaking window in recording time: `[0, t2, t3]`. */
  offsetsMs: number[];
  audioFailures: AudioFailure[];
}

type RecorderState = "inactive" | "recording" | "paused";

/**
 * Plays a Part 1 task question by question inside one recording (docs/part1-plan.md §1):
 * question text + audio → chime → countdown → next question, automatically, with the recorder paused while the
 * question audio and the chime play.
 *
 * Timings come from the task content. `timeScale` exists for the dev page's browser tests only; the product uses 1.
 * The part never gets stuck on audio: a failed question audio still plays the chime, a failed chime still starts the
 * countdown, and each failure is reported through `onAudioFailure` (analytics hooks in here later).
 */
export function QuestionSequencePlayer({
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
  const [state, dispatch] = useReducer(sequenceReducer, { questions: task.questions, timeScale }, createSequenceState);
  const [recorderState, setRecorderState] = useState<RecorderState>("inactive");

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
  }, []);

  const requestRecorder = useCallback((): Promise<PausableRecorder | null> => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return Promise.resolve(null);
    }
    return navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((stream) => {
        streamRef.current = stream;
        return new PausableRecorder(stream, { onError: (reason) => dispatch({ type: "fail", reason }) });
      })
      .catch((cause: unknown) => {
        console.error("[cefro] microphone error", cause);
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
      const src = cue === "question" ? task.questions[index]!.audio : task.chime.src;
      void player.play(src).then((result) => handleCueEnded(index, cue, result));
    },
    [task, handleCueEnded],
  );

  const start = () => {
    // Everything that needs the user's tap happens here: creating and first playing the audio element unlocks audio
    // for the whole part, and the microphone request starts at the same moment.
    cuePlayerRef.current = new CuePlayer(new Audio());
    recorderRef.current = requestRecorder();
    playCue(0, "question");
    dispatch({ type: "start" });
  };

  // Play the cue the current step needs (Question 1's audio was already started by the tap).
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
        void recorderRef.current?.then((recorder) => {
          recorder?.pause();
          if (recorder) setRecorderState(recorder.state);
          dispatch({ type: "speakingExpired", index });
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
      releaseStream();
    };
  }, [releaseStream]);

  const count = task.questions.length;

  if (phase.kind === "idle") {
    return (
      <Card className="space-y-4 p-6">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {task.instructions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <Button size="lg" onClick={start}>
          Start
        </Button>
      </Card>
    );
  }

  if (phase.kind === "failed") {
    return (
      <Alert tone="danger" title="Recording stopped">
        {phase.reason === "microphone_unavailable"
          ? "We couldn't use your microphone. Allow microphone access and try again."
          : "Something went wrong with the recording. Please try again."}
      </Alert>
    );
  }

  if (phase.kind === "finished") {
    return (
      <Card className="p-6" data-testid="sequence-finished">
        <p className="font-medium">All {count} questions done.</p>
      </Card>
    );
  }

  const { index, step } = phase;
  const question = task.questions[index]!;
  const audioFailed = state.audioFailures.some((f) => f.index === index && f.cue === "question");
  const stepLabel =
    step.kind === "prompt"
      ? "Listen to the question"
      : step.kind === "preparing"
        ? "Get ready"
        : step.kind === "chime"
          ? "Start speaking at the chime"
          : "Speak now";

  return (
    <Card className="space-y-5 p-6" data-testid="sequence-question" data-question-index={index} data-step={step.kind} data-recorder-state={recorderState}>
      <div>
        <p className="text-sm font-medium text-subtle" data-testid="question-counter">
          Question {index + 1} of {count}
        </p>
        <h2 className="mt-1 text-xl font-semibold" data-testid="question-text">
          {question.text}
        </h2>
      </div>
      {audioFailed && (
        <p className="text-sm text-muted" data-testid="audio-failed-note">
          The question audio didn&apos;t play. Read the question above.
        </p>
      )}
      <p className="text-sm font-medium" data-testid="step-label" aria-live="polite">
        {stepLabel}
      </p>
      {(step.kind === "speaking" || step.kind === "preparing") && (
        <CountdownRing
          remainingMs={remainingMs}
          totalMs={step.totalMs}
          label={step.kind === "speaking" ? "to speak" : "to prepare"}
          tone={step.kind === "speaking" ? "record" : "brand"}
        />
      )}
    </Card>
  );
}

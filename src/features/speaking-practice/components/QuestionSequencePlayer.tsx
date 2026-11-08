"use client";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { QuestionSequenceTask } from "@/domain/speaking/question-sequence";
import { useQuestionSequence, type QuestionSequenceResult } from "../hooks/useQuestionSequence";
import type { AudioFailure } from "../lib/question-sequence-machine";
import { CountdownRing } from "./CountdownRing";

export type { QuestionSequenceResult };

/**
 * DEV PAGE ONLY (/dev/part1-player): the Part 1 question-by-question player with the older `components/ui` styles.
 * The product's Part 1 practice uses the same hook (`useQuestionSequence`) on the design system (Part1Experience).
 * The part never gets stuck on audio (see the hook).
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
  const { state, phase, recorderState, remainingMs, start } = useQuestionSequence({ task, timeScale, onFinished, onAudioFailure });
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
        {["microphone_unavailable", "permission_denied", "no_microphone", "unsupported"].includes(phase.reason)
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

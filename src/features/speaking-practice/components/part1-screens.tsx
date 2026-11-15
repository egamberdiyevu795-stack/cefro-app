import Image from "next/image";
import { Card, Icon, PillAction, ProgressBar, cx, styles } from "@/components/ds";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { questionNumber } from "@/domain/speaking/task";
import type { QuestionStep } from "../lib/question-sequence-machine";
import type { RetryGoal } from "../lib/practice-flow";
import { Countdown, GoalCard, LevelMeter, SPEAK_NOW_MS } from "./screens";

/*
 * Part 1.1 and 1.2 practice screens on the design system (docs/part1-plan.md §1): one short introduction (brief), then
 * the questions one by one inside one recording. Presentational only: Part1Experience owns the player, the recorder
 * and the upload. One black button per screen: "Start" on the brief; none while the questions run (they move on by
 * themselves, as in the exam).
 */

/** "Part 1.1" / "Part 1.2", from the task's target level. */
export function part1Label(task: Pick<PublicSpeakingTask, "level">): string {
  return task.level === "A2" ? "Part 1.1" : "Part 1.2";
}

function timingsText(seconds: number[]): string {
  return seconds.every((s) => s === seconds[0]) ? `${seconds[0]} s each` : `${seconds.join(" · ")} s`;
}

function prepText(task: PublicSpeakingTask): string {
  const seconds = task.delivery?.questions.map((q) => q.prepSeconds) ?? [];
  return seconds.every((s) => s === 0) ? "None" : timingsText(seconds);
}

/** The introduction: what happens, the timings, headphones, the goal of a retry, the black "Start". */
export function Part1BriefCard({
  task,
  goal,
  onStart,
  onDropGoal,
  microphone,
  ready = true,
}: {
  task: PublicSpeakingTask;
  goal: RetryGoal | null;
  onStart: () => void;
  onDropGoal?: () => void;
  /** Shown instead of "Start" while the microphone can't be used. */
  microphone?: React.ReactNode;
  ready?: boolean;
}) {
  const count = task.prompts.length;
  const first = questionNumber(task, 0);
  return (
    <Card aria-labelledby="task-title">
      <p className="text-caption text-fg-muted">
        Speaking · {part1Label(task)} · {goal ? "Retry" : "Practice"}
      </p>
      <h1 id="task-title" className="mt-1 text-stat font-light tracking-[-0.03em] text-fg">
        {task.title}
      </h1>
      <p className="mt-3 text-body text-fg">{task.question}</p>

      <dl className="mt-5 grid grid-cols-3 gap-2">
        <Tile label="Questions" value={`${first}–${first + count - 1}`} />
        <Tile label="Prepare" value={prepText(task)} />
        <Tile label="Speak" value={timingsText(task.delivery?.questions.map((q) => q.speakingSeconds) ?? [])} />
      </dl>
      {goal && <GoalCard goal={goal} withCheck className="mt-2" />}

      <ul className="mt-5 space-y-2" data-testid="part1-instructions">
        {task.instructions.map((line) => (
          <li key={line} className="flex gap-2 text-body text-fg">
            <Icon name="check" size={16} className="mt-1 shrink-0 text-fg-subtle" />
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-6 border-t border-line pt-5">
        {microphone ?? (
          <>
            <PillAction size="lg" icon="play" onClick={onStart} disabled={!ready} className="w-full sm:w-auto disabled:cursor-wait">
              Start
            </PillAction>
            <p className="mt-3 text-label text-fg-muted">
              We&rsquo;ll ask to use your microphone. A short spoken introduction plays first; recording starts at each chime.
            </p>
            {onDropGoal && (
              <button
                type="button"
                onClick={onDropGoal}
                disabled={!ready}
                className={cx("mt-3 inline-flex min-h-11 items-center text-label text-fg-muted underline hover:text-fg disabled:cursor-wait", styles.FOCUS_RING)}
              >
                Practise without the goal
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-tile bg-well px-3 py-2.5">
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd className="text-lead font-medium text-fg">{value}</dd>
    </div>
  );
}

/** One question while the part runs: its number and text (visible all the time), the step, the countdown. */
export function Part1QuestionCard({
  task,
  index,
  step,
  remainingMs,
  level,
  audioFailed,
  goal,
  recorderState = "inactive",
}: {
  task: PublicSpeakingTask;
  /** For tests: the recorder is paused while the question and the chime play. */
  recorderState?: "inactive" | "recording" | "paused";
  index: number;
  step: QuestionStep;
  remainingMs: number;
  level: number;
  audioFailed: boolean;
  goal: RetryGoal | null;
}) {
  const count = task.prompts.length;
  const speaking = step.kind === "speaking";
  const preparing = step.kind === "preparing";
  const totalMs = speaking ? step.totalMs : 1;
  const elapsedMs = speaking ? Math.max(0, step.totalMs - remainingMs) : 0;
  const status =
    step.kind === "prompt" ? "Listen to the question" : step.kind === "chime" ? "Start speaking at the chime" : step.kind === "preparing" ? "Get ready" : "Recording";
  return (
    <Card aria-labelledby="question-title" data-testid="part1-question" data-question-index={index} data-step={step.kind} data-recorder-state={recorderState}>
      <p className="text-caption text-fg-muted" data-testid="question-counter">
        Question {questionNumber(task, index)} · {index + 1} of {count}
      </p>
      <h1 id="question-title" className="mt-2 text-title font-medium tracking-[-0.01em] text-fg" data-testid="question-text">
        {task.prompts[index]}
      </h1>
      {audioFailed && (
        <p className="mt-2 text-label text-fg-muted" data-testid="audio-failed-note">
          The question audio didn&rsquo;t play. Read the question above.
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-label font-semibold text-fg" aria-live="polite" data-testid="step-label">
          {speaking ? (
            <span aria-hidden="true" className="relative flex size-2.5">
              <span className="absolute inset-0 rounded-full bg-fg opacity-40 motion-safe:animate-ping" />
              <span className="relative size-2.5 rounded-full bg-fg" />
            </span>
          ) : (
            <Icon name="play" size={16} className="text-fg-subtle" />
          )}
          {status}
          {speaking && elapsedMs < SPEAK_NOW_MS && (
            <span data-testid="speak-now" className="rounded-full bg-well px-2 py-0.5 text-caption font-semibold text-fg">
              Speak now
            </span>
          )}
        </p>
        {speaking && <LevelMeter level={level} />}
      </div>
      {speaking ? (
        <>
          <Countdown remainingMs={remainingMs} label="left" />
          <ProgressBar value={elapsedMs / totalMs} label="Speaking time used" className="mt-3" />
        </>
      ) : preparing ? (
        <>
          <Countdown remainingMs={remainingMs} label="to get ready" />
          <p className="mt-2 text-label text-fg-muted">Think about your answer. Recording starts at the chime.</p>
        </>
      ) : (
        <p className="mt-2 text-label text-fg-muted">Recording is paused while the question plays. It starts again at the chime.</p>
      )}
      {goal && <GoalCard goal={goal} className="mt-4" />}
      <p className="mt-4 text-label text-fg-muted">The next question starts by itself.</p>
    </Card>
  );
}

/** The spoken introduction (before the first question), then the sample chime. Nothing is recorded; no button. */
export function Part1IntroCard({ task, text }: { task: PublicSpeakingTask; text: string }) {
  return (
    <Card aria-labelledby="intro-title" data-testid="part1-intro">
      <p className="flex items-center gap-2 text-label font-semibold text-fg" aria-live="polite">
        <Icon name="play" size={16} className="text-fg-subtle" />
        Listen
      </p>
      <h1 id="intro-title" className="mt-3 text-stat font-light tracking-[-0.03em] text-fg">
        {part1Label(task)}
      </h1>
      <p className="mt-3 text-body text-fg" data-testid="intro-text">
        {text.replace(/^Part 1\.[12]\.\s*/, "")}
      </p>
      <p className="mt-4 text-label text-fg-muted">The first question starts by itself after the chime.</p>
    </Card>
  );
}

/** Part 1.2: the two pictures, on screen from Question 4 to the end of Question 6. */
export function PicturesCard({ task }: { task: PublicSpeakingTask }) {
  if (!task.images?.length) return null;
  return (
    <Card aria-label="Pictures" data-testid="part1-pictures">
      <div className="grid grid-cols-2 gap-3">
        {task.images.map((image, i) => (
          <figure key={image.src}>
            <Image src={image.src} alt={image.alt} width={image.width} height={image.height} priority className="h-auto w-full rounded-tile bg-well" />
            <figcaption className="mt-2 text-caption text-fg-muted">Picture {String.fromCharCode(65 + i)}</figcaption>
          </figure>
        ))}
      </div>
    </Card>
  );
}

/** All questions done: the answer is being sent (no black button). */
export function Part1SendingCard({ task }: { task: PublicSpeakingTask }) {
  return (
    <Card aria-labelledby="step-title" data-testid="part1-sending">
      <h1 id="step-title" className="text-title font-medium tracking-[-0.01em] text-fg">
        All {task.prompts.length} questions done
      </h1>
      <p role="status" className="mt-2 text-body text-fg">
        Sending your answer&hellip;
      </p>
    </Card>
  );
}

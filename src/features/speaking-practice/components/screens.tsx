import Image from "next/image";
import Link from "next/link";
import { Card, CardHeader, Icon, PillAction, ProgressBar, ScoringLabel, cx, styles } from "@/components/ds";
import type { AttemptSummary } from "@/domain/speaking/attempt";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import type { RecorderErrorKind } from "../hooks/useAudioRecorder";
import { formatClock, formatDateTime, formatDuration } from "../lib/format";
import type { RetryGoal } from "../lib/practice-flow";

/*
 * The Part 2 practice screens on the design system: brief, preparation, recording, and the microphone states.
 * Presentational only: PracticeExperience owns the recorder, timers, upload and evaluation and passes values in.
 * One black (primary) button per screen: "Start preparation" (brief), none while preparing ("Start speaking now" is
 * quiet), "Finish" (recording), "Keep speaking" while the early-finish warning is open, "Try again" for a microphone
 * problem.
 *
 * Phone: the step card first (title or timer, goal, the action), then the questions and the picture.
 * Desktop: [questions and picture] | [step card].
 */

/** Two columns on desktop; on phones the step card (second child) comes first. */
export function PracticeLayout({ task, step, below }: { task: React.ReactNode; step: React.ReactNode; below?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.62fr)] lg:items-start">
      <div className="order-2 lg:order-none">{task}</div>
      <div className="order-1 flex flex-col gap-4 lg:order-none">
        {step}
        {below}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------------------------- task and goal cards */

/**
 * The questions and the picture, on every screen. The picture sits beside the questions when the card is wide enough
 * (a container query on the card), otherwise above them; `questionsFirst` puts the questions above it instead on a
 * narrow card (preparation and recording, where the questions matter most).
 */
export function TaskCard({ task, questionsFirst = false }: { task: PublicSpeakingTask; questionsFirst?: boolean }) {
  return (
    <Card aria-labelledby="questions-title" className="@container">
      <CardHeader id="questions-title" title={`Answer all ${task.prompts.length} questions`} />
      <div data-testid="task-picture-layout" className="flex flex-col gap-5 @xl:flex-row @xl:items-start">
        <ol className={cx("min-w-0 flex-1 space-y-4 @xl:order-2", questionsFirst ? "order-1" : "order-2")}>
          {task.prompts.map((prompt, i) => (
            <li key={prompt} className="flex gap-3">
              <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-well text-label font-semibold text-fg">
                {i + 1}
              </span>
              <span className="pt-0.5 text-body text-fg">
                <span className="sr-only">Question {i + 1}: </span>
                {prompt}
              </span>
            </li>
          ))}
        </ol>
        {task.picture && (
          <figure data-testid="task-picture" className={cx("w-full max-w-sm shrink-0 @xl:order-1 @xl:w-56 @3xl:w-64", questionsFirst ? "order-2" : "order-1")}>
            <Image
              src={task.picture.src}
              alt={task.picture.alt}
              width={task.picture.width}
              height={task.picture.height}
              priority
              className="h-auto w-full rounded-tile bg-well"
            />
            <figcaption className="mt-2 text-caption text-fg-muted">You don&apos;t need to describe the picture</figcaption>
          </figure>
        )}
      </div>
    </Card>
  );
}

/** "Your goal: …" on every screen of a retry. `withCheck` adds how the student will know it worked (brief only). */
export function GoalCard({ goal, withCheck = false, className }: { goal: RetryGoal; withCheck?: boolean; className?: string }) {
  return (
    <div role="note" aria-label="Your goal" data-testid="goal-card" className={cx("rounded-tile bg-well p-3", className)}>
      <p className="text-body text-fg">
        <span className="font-semibold">Your goal:</span> {goal.objective}
      </p>
      {withCheck && goal.check && <p className="mt-1 text-label text-fg-muted">You&rsquo;ll know it worked: {goal.check}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------ brief */

/** Brief: the task, its timings, the goal of a retry, and the black "Start preparation" (or a microphone state). */
export function BriefCard({
  task,
  goal,
  onStart,
  onDropGoal,
  microphone,
}: {
  task: PublicSpeakingTask;
  goal: RetryGoal | null;
  onStart: () => void;
  /** Retry only: practise the task without the goal. */
  onDropGoal?: () => void;
  /** Shown instead of the start button while the microphone is being asked for, or when it can't be used. */
  microphone?: React.ReactNode;
}) {
  return (
    <Card aria-labelledby="task-title">
      <p className="text-caption text-fg-muted">
        Speaking · Part {task.part} · {goal ? "Retry" : "Practice"}
      </p>
      <h1 id="task-title" className="mt-1 text-stat font-light tracking-[-0.03em] text-fg">
        {task.title}
      </h1>
      <p className="mt-3 text-body text-fg">{task.question}</p>

      <dl className="mt-5 grid grid-cols-2 gap-2">
        <Timing label="Prepare" seconds={task.preparationSeconds} />
        <Timing label="Speak" seconds={task.speakingSeconds} />
      </dl>
      {goal && <GoalCard goal={goal} withCheck className="mt-2" />}

      <div className="mt-6 border-t border-line pt-5">
        {microphone ?? (
          <>
            <PillAction size="lg" icon="mic" onClick={onStart} className="w-full sm:w-auto">
              Start preparation
            </PillAction>
            <p className="mt-3 text-label text-fg-muted">
              We&rsquo;ll ask to use your microphone first. Recording starts by itself when preparation ends.
            </p>
            {onDropGoal && (
              <button type="button" onClick={onDropGoal} className={cx("mt-3 inline-flex min-h-11 items-center text-label text-fg-muted underline hover:text-fg", styles.FOCUS_RING)}>
                Practise without the goal
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Timing({ label, seconds }: { label: string; seconds: number }) {
  return (
    <div className="rounded-tile bg-well px-3 py-2.5">
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd className="text-title font-medium text-fg">{formatDuration(seconds)}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------------------------- preparation and recording */

function Countdown({ remainingMs, label }: { remainingMs: number; label: string }) {
  return (
    <p className="mt-2 flex items-baseline gap-2">
      <span role="timer" aria-label={`${formatClock(remainingMs)} ${label}`} className="text-stat font-light tabular-nums tracking-[-0.03em] text-fg">
        {formatClock(remainingMs)}
      </span>
      <span aria-hidden="true" className="text-lead font-medium text-fg-muted">
        {label}
      </span>
    </p>
  );
}

/** Preparation: one-minute countdown; "Start speaking now" (quiet) skips the rest. No black button. */
export function PreparationCard({
  task,
  remainingMs,
  goal,
  onSkip,
}: {
  task: PublicSpeakingTask;
  remainingMs: number;
  goal: RetryGoal | null;
  onSkip: () => void;
}) {
  const totalMs = task.preparationSeconds * 1000;
  return (
    <Card aria-labelledby="step-title">
      <h1 id="step-title" className="text-label font-semibold text-fg">
        Preparation
      </h1>
      <Countdown remainingMs={remainingMs} label="to prepare" />
      <ProgressBar value={1 - remainingMs / totalMs} label="Preparation time used" className="mt-3" />
      <p className="mt-4 text-body text-fg">
        Plan a short answer with a reason for each question. Recording starts by itself at 0:00.
      </p>
      {goal && <GoalCard goal={goal} className="mt-4" />}
      <div className="mt-5">
        <PillAction size="lg" variant="quiet" icon="mic" onClick={onSkip} className="w-full sm:w-auto">
          Start speaking now
        </PillAction>
      </div>
    </Card>
  );
}

/**
 * Recording: two-minute countdown, a recording indicator (dot, word and live microphone level, never colour alone),
 * the black "Finish". Finishing very early opens a warning in the card first; the recording keeps running meanwhile.
 */
export function RecordingCard({
  task,
  remainingMs,
  level,
  goal,
  earlyWarning,
  onFinish,
  onKeepSpeaking,
  onFinishAnyway,
}: {
  task: PublicSpeakingTask;
  remainingMs: number;
  /** Microphone input level, 0–1. */
  level: number;
  goal: RetryGoal | null;
  /** True while "Finish already?" is open. */
  earlyWarning: boolean;
  onFinish: () => void;
  onKeepSpeaking: () => void;
  onFinishAnyway: () => void;
}) {
  const totalMs = task.speakingSeconds * 1000;
  const elapsedMs = Math.max(0, totalMs - remainingMs);
  return (
    <Card aria-labelledby="step-title">
      <div className="flex items-center justify-between gap-3">
        <h1 id="step-title" className="flex items-center gap-2 text-label font-semibold text-fg">
          <span aria-hidden="true" className="relative flex size-2.5">
            <span className="absolute inset-0 rounded-full bg-fg opacity-40 motion-safe:animate-ping" />
            <span className="relative size-2.5 rounded-full bg-fg" />
          </span>
          Recording
          {elapsedMs < SPEAK_NOW_MS && (
            <span data-testid="speak-now" className="rounded-full bg-well px-2 py-0.5 text-caption font-semibold text-fg">
              Speak now
            </span>
          )}
        </h1>
        <LevelMeter level={level} />
      </div>
      {/* Announced once when recording starts (after the chime), whether preparation ran out or was skipped. */}
      <p role="status" className="sr-only">
        Recording started. Speak now.
      </p>
      <Countdown remainingMs={remainingMs} label="left" />
      <ProgressBar value={elapsedMs / totalMs} label="Speaking time used" className="mt-3" />
      <p className="mt-3 text-label text-fg-muted">
        You&rsquo;ve spoken for <span className="font-semibold text-fg tabular-nums">{formatClock(elapsedMs)}</span>. Answer all{" "}
        {task.prompts.length} questions and try to use most of the time.
      </p>
      {goal && <GoalCard goal={goal} className="mt-4" />}
      <div className="mt-5">
        {earlyWarning ? (
          <div role="alert" className="rounded-tile bg-well p-4">
            <p className="text-body font-semibold text-fg">Finish already? You&rsquo;ve spoken for {formatClock(elapsedMs)}.</p>
            <p className="mt-1 text-body text-fg">
              Part {task.part} answers take about {formatDuration(task.speakingSeconds)}. An answer this short may be too short to
              score. The recording is still running.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <PillAction size="lg" icon="mic" onClick={onKeepSpeaking} autoFocus className="w-full sm:w-auto">
                Keep speaking
              </PillAction>
              <PillAction size="lg" variant="light" icon="stop" onClick={onFinishAnyway} className="w-full sm:w-auto">
                Finish anyway
              </PillAction>
            </div>
          </div>
        ) : (
          <PillAction size="lg" icon="stop" onClick={onFinish} className="w-full sm:w-auto">
            Finish
          </PillAction>
        )}
      </div>
    </Card>
  );
}

/** How long "Speak now" stays beside "Recording" after it starts. */
export const SPEAK_NOW_MS = 4000;

/** Five bars that follow the microphone input, so the student sees it hears them. */
function LevelMeter({ level }: { level: number }) {
  const lit = Math.round(Math.max(0, Math.min(1, level)) * 5);
  return (
    <span className="flex items-center gap-2">
      <Icon name="mic" size={16} className="text-fg-subtle" />
      <span aria-hidden="true" className="flex h-4 items-end gap-0.5" data-testid="level-meter">
        {[0.35, 0.55, 0.75, 0.9, 1].map((h, i) => (
          <span key={h} className={cx("w-1 rounded-full", i < lit ? "bg-accent" : "bg-well")} style={{ height: `${h * 100}%` }} />
        ))}
      </span>
      <span className="sr-only">Microphone on</span>
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------------ microphone */

export type MicrophoneStateKind = "asking" | RecorderErrorKind;

/**
 * The microphone states. Asking: the browser's permission prompt is open, nothing to press here. Denied: how to turn
 * it back on (computer, iPhone, Android), then the black "Try again". No microphone: connect one, then "Try again".
 */
export function MicrophoneState({ kind, onRetry }: { kind: MicrophoneStateKind; onRetry: () => void }) {
  const retry = (
    <PillAction size="lg" icon="retry" onClick={onRetry} className="mt-5 w-full sm:w-auto">
      Try again
    </PillAction>
  );
  const head = (title: string, icon: "mic" | "micOff") => (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-well text-fg">
        <Icon name={icon} size={20} />
      </span>
      <h2 className="text-title font-medium tracking-[-0.01em] text-fg">{title}</h2>
    </div>
  );

  switch (kind) {
    case "asking":
      return (
        <div role="status" data-testid="microphone-state" data-state="asking">
          {head("Allow microphone access", "mic")}
          <p className="mt-3 text-body text-fg">
            Your browser is asking to use the microphone. Choose <span className="font-semibold">Allow</span>. Preparation starts as
            soon as it&rsquo;s on.
          </p>
          <p className="mt-2 text-label text-fg-muted">Don&rsquo;t see the question? Look for a microphone icon in the address bar.</p>
        </div>
      );
    case "permission_denied":
      return (
        <div role="alert" data-testid="microphone-state" data-state="denied">
          {head("Microphone access is blocked", "micOff")}
          <p className="mt-3 text-body text-fg">CEFRO needs your microphone to record your answer. Turn it on, then try again.</p>
          <dl className="mt-4 divide-y divide-line border-y border-line">
            <FixRow device="On a computer">
              Select the lock or settings icon at the left of the address bar, set <span className="font-semibold">Microphone</span> to{" "}
              <span className="font-semibold">Allow</span>, then reload the page if asked.
            </FixRow>
            <FixRow device="iPhone or iPad (Safari)">
              Tap <span className="font-semibold">aA</span> in the address bar › Website Settings › Microphone › Allow.
            </FixRow>
            <FixRow device="Android (Chrome)">
              Tap the settings icon at the left of the address bar › Permissions › Microphone › Allow.
            </FixRow>
          </dl>
          {retry}
        </div>
      );
    case "no_microphone":
      return (
        <div role="alert" data-testid="microphone-state" data-state="none">
          {head("No microphone found", "micOff")}
          <p className="mt-3 text-body text-fg">
            Connect a headset or a microphone, or open CEFRO on your phone. If one is connected, check that it isn&rsquo;t muted or in
            use by another app.
          </p>
          {retry}
        </div>
      );
    case "unsupported":
      return (
        <div role="alert" data-testid="microphone-state" data-state="unsupported">
          {head("This browser can’t record", "micOff")}
          <p className="mt-3 text-body text-fg">Open CEFRO in a recent version of Chrome, Edge, Firefox or Safari.</p>
        </div>
      );
    case "recorder_failed":
      return (
        <div role="alert" data-testid="microphone-state" data-state="failed">
          {head("Recording stopped unexpectedly", "micOff")}
          <p className="mt-3 text-body text-fg">Something went wrong with the microphone. Check it, then try again.</p>
          {retry}
        </div>
      );
  }
}

function FixRow({ device, children }: { device: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <dt className="text-label font-semibold text-fg">{device}</dt>
      <dd className="mt-0.5 text-body text-fg">{children}</dd>
    </div>
  );
}

/** A microphone problem after the brief (preparation, recording): on its own card. */
export function MicrophoneCard({ kind, onRetry }: { kind: MicrophoneStateKind; onRetry: () => void }) {
  return (
    <Card>
      <MicrophoneState kind={kind} onRetry={onRetry} />
    </Card>
  );
}

/** The browser returned no audio after Finish. */
export function NothingRecordedCard({ onRecordAgain }: { onRecordAgain: () => void }) {
  return (
    <Card aria-labelledby="step-title">
      <h1 id="step-title" className="text-title font-medium tracking-[-0.01em] text-fg">
        Your recording didn&rsquo;t save
      </h1>
      <p className="mt-2 text-body text-fg">The browser didn&rsquo;t return any audio. Check your microphone and record again.</p>
      <PillAction size="lg" icon="mic" onClick={onRecordAgain} className="mt-5 w-full sm:w-auto">
        Record again
      </PillAction>
    </Card>
  );
}

/* --------------------------------------------------------------------------------------------------------- history */

/** Earlier attempts at this task, each a link to its result page (/result/[id]). */
export function AttemptsCard({ attempts }: { attempts: AttemptSummary[] }) {
  if (attempts.length === 0) return null;
  return (
    <Card aria-labelledby="attempts-title">
      <CardHeader id="attempts-title" title="Your attempts" />
      <ul className="-my-1 divide-y divide-line">
        {attempts.map((attempt) => (
          <li key={attempt.id}>
            <Link
              href={`/result/${encodeURIComponent(attempt.id)}`}
              className={cx("flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left hover:bg-well/50", styles.FOCUS_RING)}
            >
              <span>
                <span className="block text-body font-semibold text-fg">Attempt {attempt.attemptNumber}</span>
                <span className="block text-caption text-fg-muted">{formatDateTime(attempt.createdAt)}</span>
              </span>
              {attempt.band ? (
                <span className="text-label font-semibold text-fg">
                  Band {attempt.band.band} · {attempt.band.label}
                </span>
              ) : attempt.status === "failed" ? (
                <span className="text-label text-fg-muted">Not scored</span>
              ) : (
                <ScoringLabel />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------------------------------------------------- errors */

/**
 * The upload failed: the recording is still in this tab. Black "Try sending again"; quiet "Download a copy" and
 * "Record again". (Sent again by itself when the device comes back online.)
 */
export function UploadFailedCard({
  message,
  recording,
  onRetry,
  onReRecord,
}: {
  message: string;
  recording: { url: string; mimeType: string } | null;
  onRetry: () => void;
  onReRecord: () => void;
}) {
  const extension = recording?.mimeType.includes("mp4") ? "m4a" : recording?.mimeType.includes("ogg") ? "ogg" : "webm";
  return (
    <div className="mx-auto max-w-2xl">
      <Card aria-labelledby="step-title">
        <h1 id="step-title" className="text-title font-medium tracking-[-0.01em] text-fg">
          Your recording wasn&apos;t sent
        </h1>
        <p role="alert" className="mt-2 text-body text-fg">
          {message}
        </p>
        <p className="mt-2 text-body text-fg-muted">
          Your answer is still saved in this browser tab. Don&rsquo;t close it until it&rsquo;s sent; we&rsquo;ll also send it as soon as
          you&rsquo;re back online.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <PillAction size="lg" icon="retry" onClick={onRetry} disabled={!recording} className="w-full sm:w-auto">
            Try sending again
          </PillAction>
          {recording && (
            <a href={recording.url} download={`cefro-answer.${extension}`} className={cx(styles.PILL_QUIET, "h-11 w-full sm:w-auto")}>
              Download a copy
            </a>
          )}
          <PillAction size="lg" variant="quiet" icon="mic" onClick={onReRecord} className="w-full sm:w-auto">
            Record again
          </PillAction>
        </div>
      </Card>
    </div>
  );
}

/** A one-card message with at most one action (black when given): answer not found, can't compare, older result. */
export function NoticeCard({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: { label: string; onClick: () => void; icon?: "mic" | "retry" } | null;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <Card aria-labelledby="notice-title">
        <h1 id="notice-title" className="text-title font-medium tracking-[-0.01em] text-fg">
          {title}
        </h1>
        <div className="mt-2 text-body text-fg">{children}</div>
        {action && (
          <PillAction size="lg" icon={action.icon ?? "mic"} onClick={action.onClick} className="mt-6 w-full sm:w-auto">
            {action.label}
          </PillAction>
        )}
      </Card>
    </div>
  );
}

/** A problem above the current screen (e.g. an attempt that couldn't be opened). No button: the screen below still works. */
export function InlineNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-tile bg-card p-4 text-body text-fg shadow-card">
      <span className="font-semibold">{title}</span> {children}
    </p>
  );
}

import { Card, CardHeader, Icon, PillAction, ProgressBar, cx } from "@/components/ds";
import { SIDE_LABELS, pointsOn, type PointId, type PublicArgumentTask } from "@/domain/speaking/argument-task";
import { MicCheck } from "@/features/speaking-practice/components/MicCheck";
import { Countdown, GoalCard, LevelMeter, PartIntroCard, SPEAK_NOW_MS } from "@/features/speaking-practice/components/screens";
import { formatClock, formatDuration } from "@/features/speaking-practice/lib/format";
import type { RetryGoal } from "@/features/speaking-practice/lib/practice-flow";

/*
 * The Part 3 practice screens (official Question 8): brief → spoken introduction → preparation (the statement and its Pros / Cons table,
 * nothing to tick, as in the real exam) → recording. Presentational only; Part3Practice owns the recorder and timers.
 * One black button per screen: "Start" (brief), none during the spoken introduction or while preparing ("Start speaking
 * now" is quiet),
 * "Finish" (recording), "Keep speaking" while the early-finish warning is open.
 *
 * Phone: the step card first, then the statement and the lists. Desktop: [statement and lists] | [step card].
 */

/**
 * The statement and its Pros / Cons lists, on every screen. Nothing is ticked (as in the real exam). A retry of an older
 * attempt that ticked points still marks them with a tick and the word "Chosen" (never colour alone).
 */
export function StatementCard({ task, chosen }: { task: PublicArgumentTask; chosen: readonly PointId[] }) {
  const anyChosen = chosen.length > 0;
  return (
    <Card aria-labelledby="statement-title">
      <CardHeader id="statement-title" title="The statement" />
      <p className="text-lead font-medium text-fg">{task.statement}</p>
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {(["for", "against"] as const).map((side) => (
          <section key={side} className="min-w-0" data-testid={`list-${side}`} aria-label={SIDE_LABELS[side]}>
            <h3 className="text-label font-semibold text-fg">{SIDE_LABELS[side]}</h3>
            <ul className="mt-2 space-y-2">
              {pointsOn(task, side).map((point) => {
                const isChosen = chosen.includes(point.id);
                return (
                  <li key={point.id}>
                    <p className={cx("flex items-start gap-3 rounded-tile px-3 py-2.5", isChosen ? "bg-well" : "")}>
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                        {isChosen ? <Icon name="check" size={16} className="text-fg" /> : <span aria-hidden="true" className="size-1.5 rounded-full bg-fg-subtle" />}
                      </span>
                      <span className={cx("min-w-0 flex-1 text-body", isChosen || !anyChosen ? "text-fg" : "text-fg-muted")}>
                        <span className="font-semibold">{point.id}</span> {point.text}
                        {isChosen && <span className="ml-2 text-caption font-semibold text-fg">Chosen</span>}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

export function Part3BriefCard({
  task,
  goal,
  onStart,
  ready = true,
  microphone,
}: {
  task: PublicArgumentTask;
  goal: RetryGoal | null;
  onStart: () => void;
  ready?: boolean;
  microphone?: React.ReactNode;
}) {
  return (
    <Card aria-labelledby="task-title">
      <p className="text-caption text-fg-muted">Speaking · Part 3 · {goal ? "Retry" : "Practice"}</p>
      <h1 id="task-title" className="mt-1 text-stat font-light tracking-[-0.03em] text-fg">
        {task.title}
      </h1>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-body text-fg">
        {task.instructions.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <dl className="mt-5 grid grid-cols-2 gap-2">
        <Timing label="Prepare" seconds={task.preparationSeconds} />
        <Timing label="Speak" seconds={task.speakingSeconds} />
      </dl>
      {goal && <GoalCard goal={goal} withCheck className="mt-2" />}
      <div className="mt-6 border-t border-line pt-5">
        {microphone ?? (
          <>
            <div className="mb-5">
              <MicCheck ready={ready} />
            </div>
            <PillAction size="lg" icon="mic" onClick={onStart} disabled={!ready} className="w-full sm:w-auto disabled:cursor-wait">
              Start
            </PillAction>
            <p className="mt-3 text-label text-fg-muted">
              Turn your sound on. You hear a short introduction and a chime, then the minute of preparation starts: plan
              your answer then. At 0:00 another chime, and recording starts by itself.
            </p>
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

/** The Part 3 introduction screen (the shared exam-style introduction card). */
export function Part3IntroCard({ text, goal }: { text: string; goal: RetryGoal | null }) {
  return <PartIntroCard part="Part 3" text={text} goal={goal} testId="part3-intro" />;
}

/** Preparation: one minute to plan 2 + 2 points (no ticking, as in the real exam). "Start speaking now" (quiet) skips the rest. No black button. */
export function Part3PreparationCard({
  totalMs,
  remainingMs,
  goal,
  onSkip,
}: {
  /** The whole preparation time. */
  totalMs: number;
  remainingMs: number;
  goal: RetryGoal | null;
  onSkip: () => void;
}) {
  return (
    <Card aria-labelledby="step-title">
      <h1 id="step-title" className="text-label font-semibold text-fg">
        Preparation
      </h1>
      <Countdown remainingMs={remainingMs} label="to prepare" />
      <ProgressBar value={1 - remainingMs / totalMs} label="Preparation time used" className="mt-3" />
      <p className="mt-4 text-body text-fg">
        Choose two Pros and two Cons in your head and plan one reason or example for each. At 0:00 you hear the chime and recording
        starts by itself.
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

/** Recording: two-minute countdown, the recording indicator, the chosen points (in the statement card), the black "Finish". */
export function Part3RecordingCard({
  totalMs,
  remainingMs,
  level,
  goal,
  earlyWarning,
  onFinish,
  onKeepSpeaking,
  onFinishAnyway,
}: {
  /** The whole speaking time. */
  totalMs: number;
  remainingMs: number;
  level: number;
  goal: RetryGoal | null;
  earlyWarning: boolean;
  onFinish: () => void;
  onKeepSpeaking: () => void;
  onFinishAnyway: () => void;
}) {
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
          {elapsedMs < SPEAK_NOW_MS && <span className="rounded-full bg-well px-2 py-0.5 text-caption font-semibold text-fg">Speak now</span>}
        </h1>
        <LevelMeter level={level} />
      </div>
      <p role="status" className="sr-only">
        Recording started. Speak now.
      </p>
      <Countdown remainingMs={remainingMs} label="left" />
      <ProgressBar value={elapsedMs / totalMs} label="Speaking time used" className="mt-3" />
      <p className="mt-3 text-label text-fg-muted">
        You&rsquo;ve spoken for <span className="font-semibold tabular-nums text-fg">{formatClock(elapsedMs)}</span>. Argue both sides: two Pros and two Cons.
      </p>
      {goal && <GoalCard goal={goal} className="mt-4" />}
      <div className="mt-5">
        {earlyWarning ? (
          <div role="alert" className="rounded-tile bg-well p-4">
            <p className="text-body font-semibold text-fg">Finish already? You&rsquo;ve spoken for {formatClock(elapsedMs)}.</p>
            <p className="mt-1 text-body text-fg">Part 3 answers take about 2 min. An answer this short may not cover both sides. The recording is still running.</p>
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

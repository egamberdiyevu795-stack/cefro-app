import { Card, CardHeader, Icon, PillAction, ProgressBar, cx } from "@/components/ds";
import { POINTS_PER_SIDE, SIDE_LABELS, pointsOn, type PointId, type PublicArgumentTask, type Side } from "@/domain/speaking/argument-task";
import { MicCheck } from "@/features/speaking-practice/components/MicCheck";
import { Countdown, GoalCard, LevelMeter, PartIntroCard, SPEAK_NOW_MS } from "@/features/speaking-practice/components/screens";
import { formatClock, formatDuration } from "@/features/speaking-practice/lib/format";
import type { RetryGoal } from "@/features/speaking-practice/lib/practice-flow";

/*
 * The Part 3 practice screens (official Question 8): brief → spoken introduction → preparation, where the student chooses two points from
 * each list during the minute → recording. Presentational only; Part3Practice owns the recorder and timers.
 * One black button per screen: "Start" (brief), none during the spoken introduction or while preparing ("Start speaking
 * now" is quiet),
 * "Finish" (recording), "Keep speaking" while the early-finish warning is open.
 *
 * Phone: the step card first, then the statement and the lists. Desktop: [statement and lists] | [step card].
 */

const countOn = (chosen: readonly PointId[], side: Side) => chosen.filter((id) => id.startsWith(side === "for" ? "F" : "A")).length;

/** "FOR 1 of 2 · AGAINST 2 of 2". */
export function choiceSummary(chosen: readonly PointId[]): string {
  return `FOR ${countOn(chosen, "for")} of ${POINTS_PER_SIDE} · AGAINST ${countOn(chosen, "against")} of ${POINTS_PER_SIDE}`;
}

/** Can this point be ticked now? A side takes at most two; a ticked point can always be unticked. */
export function canToggle(chosen: readonly PointId[], id: PointId): boolean {
  return chosen.includes(id) || countOn(chosen, id.startsWith("F") ? "for" : "against") < POINTS_PER_SIDE;
}

/**
 * The statement and both lists, on every screen. `onToggle` (preparation): each point is a checkbox, at most two per
 * side. Without it, the chosen points are marked with a tick and the word "Chosen" (never colour alone).
 */
export function StatementCard({
  task,
  chosen,
  onToggle,
}: {
  task: PublicArgumentTask;
  chosen: readonly PointId[];
  onToggle?: (id: PointId) => void;
}) {
  return (
    <Card aria-labelledby="statement-title">
      <CardHeader id="statement-title" title={onToggle ? "Choose two points from each list" : "The statement"} />
      <p className="text-lead font-medium text-fg">{task.statement}</p>
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {(["for", "against"] as const).map((side) => (
          <fieldset key={side} className="min-w-0" data-testid={`list-${side}`}>
            <legend className="flex w-full items-baseline justify-between gap-2 text-label font-semibold text-fg">
              <span>{SIDE_LABELS[side].toUpperCase()}</span>
              {onToggle && (
                <span className="font-normal text-fg-muted">
                  {countOn(chosen, side)} of {POINTS_PER_SIDE} chosen
                </span>
              )}
            </legend>
            <ul className="mt-2 space-y-2">
              {pointsOn(task, side).map((point) => {
                const isChosen = chosen.includes(point.id);
                return (
                  <li key={point.id}>
                    {onToggle ? (
                      <label
                        className={cx(
                          "flex min-h-11 cursor-pointer items-start gap-3 rounded-tile px-3 py-2.5",
                          isChosen ? "bg-well" : "bg-card ring-1 ring-inset ring-line",
                          !canToggle(chosen, point.id) && "cursor-not-allowed",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChosen}
                          disabled={!canToggle(chosen, point.id)}
                          onChange={() => onToggle(point.id)}
                          className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
                        />
                        <span className="text-body text-fg">
                          <span className="font-semibold">{point.id}</span> {point.text}
                        </span>
                      </label>
                    ) : (
                      <p className={cx("flex items-start gap-3 rounded-tile px-3 py-2.5", isChosen ? "bg-well" : "")}>
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                          {isChosen ? <Icon name="check" size={16} className="text-fg" /> : <span aria-hidden="true" className="size-1.5 rounded-full bg-fg-subtle" />}
                        </span>
                        <span className={cx("min-w-0 flex-1 text-body", isChosen ? "text-fg" : "text-fg-muted")}>
                          <span className="font-semibold">{point.id}</span> {point.text}
                          {isChosen && <span className="ml-2 text-caption font-semibold text-fg">Chosen</span>}
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
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
              Turn your sound on. You hear a short introduction and a chime, then the minute of preparation starts: choose
              your points then. At 0:00 another chime, and recording starts by itself.
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

/** Preparation: one minute to choose 2 + 2 points and plan. "Start speaking now" (quiet) skips the rest. No black button. */
export function Part3PreparationCard({
  totalMs,
  remainingMs,
  chosen,
  goal,
  onSkip,
}: {
  /** The whole preparation time. */
  totalMs: number;
  remainingMs: number;
  chosen: readonly PointId[];
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
        Tick two points in each list and plan one reason or example for each. At 0:00 you hear the chime and recording starts by itself.
      </p>
      <p role="status" data-testid="choice-summary" className="mt-2 text-label font-semibold text-fg">
        {choiceSummary(chosen)}
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
  chosen,
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
  chosen: readonly PointId[];
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
        You&rsquo;ve spoken for <span className="font-semibold tabular-nums text-fg">{formatClock(elapsedMs)}</span>. Argue both sides: {choiceSummary(chosen)}.
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

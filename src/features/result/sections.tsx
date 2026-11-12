import Link from "next/link";
import { Card, CardHeader, DeltaLabel, DemoLabel, Icon, PillAction, PillButton, ScoringLabel, cx, styles, type IconName } from "@/components/ds";
import { describeFailure } from "@/features/speaking-practice/lib/failure-messages";
import { RecordingPlayer } from "@/features/speaking-practice/components/RecordingPlayer";
import { audioRetentionNote } from "@/domain/audio-retention";
import { mockLink } from "@/features/demo/demo-mode";
import { practiceHref as practiceLink } from "@/features/speaking-practice/lib/practice-flow";
import { TranscriptWithFixes } from "./TranscriptWithFixes";
import type { TranscriptFixesView } from "./transcript-fixes";
import { GOAL_LABEL, GOAL_NOTE, formatDuration, type QuestionVerdict, type ResultPageState, type ResultView } from "./view-model";

/*
 * Result page sections. Built only from components/ds and the design-system tokens; values come from the view model.
 * One black (primary) action per screen: "Retry with this goal" on a result, "Record again" when it couldn't be scored,
 * none while scoring.
 */

type Task = { id: string; title: string; part: number; prompts: readonly string[] };

const practiceHref = (task: { id: string }) => practiceLink(task.id);

/**
 * Where an action goes: a link (the prototype, a page of its own) or a callback (the practice page, which keeps its
 * state and shows the next step in place).
 */
export type ActionTarget = string | (() => void);

export function Action({
  target,
  variant = "primary",
  size = "md",
  icon,
  disabled,
  className,
  children,
}: {
  target: ActionTarget;
  variant?: "primary" | "quiet" | "light";
  size?: "lg" | "md" | "sm";
  icon?: IconName;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return typeof target === "string" ? (
    <PillButton href={target} variant={variant} size={size} icon={icon} className={className}>
      {children}
    </PillButton>
  ) : (
    <PillAction onClick={target} variant={variant} size={size} icon={icon} disabled={disabled} className={className}>
      {children}
    </PillAction>
  );
}

/** A stored recording the student can play back (real attempts only). */
export type AnswerAudio = {
  src: string;
  durationMs: number | null;
  /** Audio retention: when the daily job deleted the audio (then no player), or when it will. */
  deletedAt?: string | null;
  deletesAt?: string | null;
};

/* --------------------------------------------------------------------------------------------------- scored result */

/**
 * Phone, top to bottom: result, questions, biggest fix, patterns (when there are any), skills, your answer.
 * Desktop: [result, biggest fix, patterns, your answer] | [questions, skills]. The columns are `display: contents` on phones so
 * the cards take their own `order`.
 */
export function ScoredResult({
  view,
  task,
  retryHref,
  onCompare,
  audio,
  lesson = null,
  demo = false,
  teacher = null,
  children,
}: {
  view: ResultView;
  /**
   * A teacher's read-only view of a student's shared attempt (Teacher view T5): the student's name instead of "Your",
   * no player, no Retry, no Learn how, no comparison. `children` goes under the result card ("Your view").
   */
  teacher?: { studentName: string } | null;
  children?: React.ReactNode;
  task: Task;
  /** The approved lesson for the biggest fix ("Learn how"); null when no approved lesson matches (then no link). */
  lesson?: FixLesson | null;
  /** Mock data (the /result prototype): the "Demo result" label at the top of the result card. Never for a real attempt. */
  demo?: boolean;
  /** "Retry with this goal": a link (default: the practice page) or a callback. */
  retryHref?: ActionTarget;
  /** A retry: open the side-by-side comparison with the previous attempt. */
  onCompare?: ActionTarget | null;
  audio?: AnswerAudio | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.62fr)] lg:items-start">
      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <ResultCard view={view} onCompare={teacher ? null : (onCompare ?? null)} demo={demo} teacher={teacher} className="order-1 lg:order-none" />
        {children && <div className="order-1 lg:order-none">{children}</div>}
        <BiggestFixCard view={view} retryHref={teacher ? null : (retryHref ?? practiceHref(task))} lesson={teacher ? null : lesson} className="order-3 lg:order-none" />
        {view.patterns.length > 0 && <PatternsCard patterns={view.patterns} className="order-4 lg:order-none" />}
        <AnswerCard
          title={teacher ? "Answer" : undefined}
          transcript={view.transcript}
          fixes={view.transcriptFixes}
          durationMs={view.durationMs}
          audio={teacher ? null : audio}
          className="order-6 lg:order-none"
        />
      </div>
      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <QuestionsCard view={view} className="order-2 lg:order-none" />
        <SkillsCard view={view} className="order-5 lg:order-none" />
      </div>
    </div>
  );
}

const ZERO_TEXT: Partial<Record<NonNullable<ResultView["zeroReason"]>, string>> = {
  below_B1: "Band 0 because the language is below B1, even with every question answered.",
  below_A2: "Band 0 because the language is below A2, even with every question answered.",
  below_A1: "Band 0 because there is no meaningful language to rate yet.",
  memorized_or_irrelevant: "Band 0 because the answer doesn't answer these questions: it sounds prepared or is about something else.",
  no_question_on_topic: "Band 0 because no question was answered.",
};

function ResultCard({
  view,
  onCompare,
  demo,
  teacher = null,
  className,
}: {
  view: ResultView;
  onCompare: ActionTarget | null;
  demo: boolean;
  teacher?: { studentName: string } | null;
  className?: string;
}) {
  const retry = view.retry;
  const change = retry ? retry.band - retry.previousBand : 0;
  return (
    <Card aria-labelledby="result-title" className={className}>
      {demo && <DemoLabel className="mb-3" />}
      <p className="text-caption text-fg-muted">
        {teacher ? teacher.studentName : "Your result"} · {view.taskTitle}
      </p>
      {retry && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-label font-semibold text-fg">
            Band {retry.previousBand} → {retry.band}
          </span>
          {change > 0 && <DeltaLabel label={`Up ${change} ${change === 1 ? "band" : "bands"} from your last attempt`}>+{change} {change === 1 ? "band" : "bands"}</DeltaLabel>}
          {retry.goal && (
            <span className="inline-flex items-center gap-1 text-label text-fg">
              <span aria-hidden="true" className="text-fg-muted">·</span>
              <Icon name={retry.goal === "met" ? "check" : retry.goal === "partly" ? "partly" : "cross"} size={14} className="text-fg-subtle" />
              {GOAL_LABEL[retry.goal]}
              {GOAL_NOTE[retry.goal] && <span className="text-fg-muted">· {GOAL_NOTE[retry.goal]}</span>}
            </span>
          )}
        </div>
      )}
      <h1 id="result-title" className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1" aria-label={view.headline}>
        <span className="text-lead font-medium text-fg-muted">{view.partLabel} ·</span>
        <span className="text-stat font-light tracking-[-0.03em] text-fg">Band {view.band}</span>
        <span className="text-lead font-medium text-fg">· {view.bandLabel}</span>
      </h1>

      <BandMeter band={view.band} bandMax={view.bandMax} target={view.target.band} className="mt-5" />
      {view.target.above ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-fg">
          <DeltaLabel>Above your target</DeltaLabel>
          {view.target.above.next && (
            <span>
              <span aria-hidden="true" className="text-fg-muted">· </span>Next: {view.target.above.next}
            </span>
          )}
        </p>
      ) : (
        <p className="mt-3 text-body text-fg">{view.target.text}</p>
      )}
      {view.zeroReason && ZERO_TEXT[view.zeroReason] && <p className="mt-1 text-label text-fg-muted">{ZERO_TEXT[view.zeroReason]}</p>}
      {view.provisional && <p className="mt-1 text-label text-fg-muted">Pronunciation wasn&rsquo;t checked in this attempt.</p>}
      {retry?.goalText && (
        <p className="mt-4 border-t border-line pt-3 text-label text-fg-muted">
          {teacher ? "Goal" : "Your goal"}: <span className="text-fg">{retry.goalText}</span>
        </p>
      )}
      {retry && onCompare && (
        <Action target={onCompare} variant="quiet" size="sm" icon="layers" className="mt-3">
          Compare with your last attempt
        </Action>
      )}
      {view.developmentEvaluator && (
        <p data-testid="development-evaluator" className="mt-4 rounded-tile bg-well p-3 text-label text-fg">
          <span className="font-semibold">Development evaluator.</span> This result comes from the local test evaluator, not a real
          assessment.
        </p>
      )}
    </Card>
  );
}

/** One segment per band (0…max, band 0 exists): filled up to the band; the target segment is named under it. Not colour alone: the words carry it. */
export function BandMeter({ band, bandMax, target, className }: { band: number; bandMax: number; target: number; className?: string }) {
  const segments = Array.from({ length: bandMax + 1 }, (_, i) => i);
  const columns = { gridTemplateColumns: `repeat(${bandMax + 1}, minmax(0, 1fr))` };
  return (
    <div className={className} role="img" aria-label={`Band ${band} on a scale of 0 to ${bandMax}. Target: band ${target}.`}>
      <div className="grid gap-1" style={columns}>
        {segments.map((n) => (
          <div key={n} className={cx("h-1.5 rounded-full", n <= band ? "bg-accent" : "bg-well")} />
        ))}
      </div>
      <div className="mt-1.5 grid gap-1" style={columns}>
        {segments.map((n) => (
          <span key={n} className={cx("text-caption", n === target ? "font-semibold text-fg" : "text-fg-muted")}>
            {n}
            {n === target && <span className="block">Target</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

const VERDICT_ICON: Record<QuestionVerdict, IconName> = { answered: "check", partly: "partly", not_counted: "cross" };

function QuestionsCard({ view, className }: { view: ResultView; className?: string }) {
  const counted = view.questions.filter((q) => q.verdict !== "not_counted").length;
  return (
    <Card aria-labelledby="questions-title" className={className}>
      <CardHeader id="questions-title" title="Questions" action={<span className="text-label text-fg-muted">{counted} of {view.questions.length} counted</span>} />
      <ol className="-my-1 divide-y divide-line">
        {view.questions.map((q) => (
          <li key={q.id} className="flex gap-3 py-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-well text-fg">
              <Icon name={VERDICT_ICON[q.verdict]} size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-3">
                <span className="text-body font-semibold text-fg">Question {q.number}</span>
                <span className="shrink-0 text-label font-medium text-fg">{q.verdictLabel}</span>
              </p>
              <p className="text-label text-fg-muted">{q.prompt}</p>
              {q.verdict !== "answered" && q.reason && <p className="mt-1 text-body text-fg">{q.reason}</p>}
              {q.hint && !q.reason.includes(q.hint.replace(/^Next time, |\.$/g, "")) && (
                <p className="mt-1 text-body font-medium text-fg" data-testid="question-hint">
                  {q.hint}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** A lesson link on the Biggest fix card: the lesson page for this result, and the lesson's title. */
export type FixLesson = { href: string; title: string };

/**
 * "Retry with this goal" opens the practice page as a retry of this attempt (`retryHref`), which carries the goal.
 * "Learn how" (quiet) opens the approved lesson for this fix, when there is one.
 */
function BiggestFixCard({ view, retryHref, lesson, className }: { view: ResultView; retryHref: ActionTarget | null; lesson: FixLesson | null; className?: string }) {
  const { fix } = view;
  return (
    <Card aria-labelledby="fix-title" className={className}>
      <CardHeader id="fix-title" title="Biggest fix" />
      <p className="text-caption text-fg-muted">{fix.label}</p>
      <p className="mt-3 text-caption text-fg-muted">{fix.quoteLabel}</p>
      {fix.quoteKind === "student" ? (
        <blockquote className="mt-1 border-l-2 border-accent pl-3 text-body text-fg">“{fix.quote}”</blockquote>
      ) : (
        <p className="mt-1 text-body text-fg">{fix.quote}</p>
      )}
      <p className="mt-4 text-caption text-fg-muted">{fix.adviceLabel}</p>
      <p className="mt-1 text-lead font-medium text-fg">{fix.tryInstead}</p>
      {(fix.goal || fix.check) && (
        <div className="mt-5 rounded-tile bg-well p-3">
          {fix.goal && (
            <>
              <p className="text-caption font-semibold text-fg">{retryHref ? "Goal for your retry" : "Goal for the retry"}</p>
              <p className="mt-1 text-body text-fg">{fix.goal}</p>
            </>
          )}
          {fix.check && <p className={cx("text-label text-fg-muted", fix.goal && "mt-2")}>You&rsquo;ll know it worked: {fix.check}</p>}
        </div>
      )}
      {retryHref && (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Action target={retryHref} icon="retry" className="w-full sm:w-auto">
            Retry with this goal
          </Action>
          {lesson && (
            <PillButton href={lesson.href} variant="quiet" icon="book" className="w-full sm:w-auto" label={`Learn how: ${lesson.title}`}>
              Learn how
            </PillButton>
          )}
        </div>
      )}
    </Card>
  );
}

/** Repeated mistakes, under the biggest fix: name, how many times, one quote. Hidden when there are none. */
function PatternsCard({ patterns, className }: { patterns: ResultView["patterns"]; className?: string }) {
  return (
    <Card aria-labelledby="patterns-title" className={className} data-testid="patterns">
      <CardHeader id="patterns-title" title="Patterns in this answer" />
      <ul className="-my-1 divide-y divide-line">
        {patterns.map((p) => (
          <li key={p.name} className="py-3">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-body font-semibold text-fg">{p.name}</span>
              <span className="shrink-0 text-label text-fg-muted">{p.count === 1 ? "once" : `${p.count} times`}</span>
            </p>
            <blockquote className="mt-1.5 border-l-2 border-accent pl-3 text-body text-fg">&ldquo;{p.quote}&rdquo;</blockquote>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Each skill folded by default: name and level; open for the quote and why. */
function SkillsCard({ view, className }: { view: ResultView; className?: string }) {
  return (
    <Card aria-labelledby="skills-title" className={className}>
      <CardHeader id="skills-title" title="Skills" />
      <ul className="-my-1 divide-y divide-line">
        {view.skills.map((s) => (
          <li key={s.feature}>
            <details className="group">
              <summary
                className={cx(
                  "flex min-h-11 cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden",
                  styles.FOCUS_RING,
                )}
              >
                <span className="flex-1 text-body font-semibold text-fg">{s.name}</span>
                <span className={cx("text-body", s.level ? "font-medium text-fg" : "text-fg-muted")}>
                  {s.previousLevelLabel && (
                    <>
                      <span className="sr-only">was </span>
                      <span className="text-fg-muted">{s.previousLevelLabel}</span>
                      <span aria-hidden="true"> → </span>
                      <span className="sr-only">, now </span>
                    </>
                  )}
                  {s.levelLabel}
                </span>
                <Icon name="chevronDown" size={16} className="text-fg-subtle transition-transform group-open:rotate-180" />
              </summary>
              <div className="pb-4 pr-7">
                {s.level === null ? (
                  <p className="text-body text-fg-muted">{view.pronunciationNote ?? "Pronunciation wasn't checked in this attempt."}</p>
                ) : (
                  <>
                    {s.quote && (
                      <>
                        {s.quoteLabel && <p className="mb-1 text-caption font-semibold text-fg">{s.quoteLabel}</p>}
                        <blockquote className="border-l-2 border-accent pl-3 text-body text-fg">“{s.quote}”</blockquote>
                      </>
                    )}
                    {s.note && <p className={cx("text-body text-fg-muted", s.quote && "mt-2")}>{s.note}</p>}
                  </>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AnswerCard({
  title = "Your answer",
  transcript,
  durationMs,
  empty,
  audio,
  fixes,
  className,
}: {
  title?: string;
  transcript: string | null;
  durationMs: number;
  /** The transcript with the student's mistakes underlined and expandable; null/absent = the plain transcript. */
  fixes?: TranscriptFixesView | null;
  /** Shown instead of the transcript when there is none. */
  empty?: string;
  /** The stored recording: a real player. Without it, no player (never a control that does nothing). */
  audio?: AnswerAudio | null;
  className?: string;
}) {
  const retentionNote = audio ? audioRetentionNote({ deletedAt: audio.deletedAt ?? null, deletesAt: audio.deletesAt ?? null }) : null;
  return (
    <Card aria-labelledby="answer-title" className={className}>
      <CardHeader
        id="answer-title"
        title={title}
        action={
          <span className="inline-flex items-center gap-1.5 text-label text-fg-muted">
            <Icon name="clock" size={14} className="text-fg-subtle" />
            {formatDuration(durationMs)}
          </span>
        }
      />
      {audio ? (
        <div className="mb-4">
          {!audio.deletedAt && <RecordingPlayer src={audio.src} durationMs={audio.durationMs} label="Your recorded answer" />}
          {retentionNote && (
            <p data-testid="audio-retention" className={cx("text-label text-fg-muted", !audio.deletedAt && "mt-2")}>
              {retentionNote}
            </p>
          )}
        </div>
      ) : null}
      {transcript && fixes ? (
        <TranscriptWithFixes view={fixes} />
      ) : (
        <>
          <p className="text-caption text-fg-muted">Transcript</p>
          {transcript ? <p className="mt-1 text-body text-fg">{transcript}</p> : <p className="mt-1 text-body text-fg-muted">{empty}</p>}
        </>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------------------------------- other states */

const STEPS = [
  { key: "saved", label: "Recording saved" },
  { key: "transcribing", label: "Writing down what you said" },
  { key: "scoring", label: "Scoring your answer" },
] as const;

/**
 * Waiting for the result. No black button: there is nothing to do yet. A retry shows its goal. `notice` is a quiet
 * line for a slow or interrupted check (practice page).
 */
export function ScoringResult({
  state,
  notice,
  demo = false,
}: {
  state: Extract<ResultPageState, { kind: "scoring" }>;
  notice?: string | null;
  /** Mock data: the "Demo result" label. Never for a real attempt. */
  demo?: boolean;
}) {
  const current = STEPS.findIndex((s) => s.key === state.step);
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4">
      <Card aria-labelledby="result-title">
        {demo && <DemoLabel className="mb-3" />}
        <p className="text-caption text-fg-muted">Your result · {state.task.title}</p>
        <h1 id="result-title" className="mt-2 text-stat font-light tracking-[-0.03em] text-fg">
          Scoring…
        </h1>
        <p className="mt-3 text-body text-fg-muted">This usually takes under a minute. You can leave this page; the result will wait for you.</p>
        {notice && (
          <p role="status" className="mt-2 text-body text-fg">
            {notice}
          </p>
        )}
        {state.goal && (
          <p role="note" aria-label="Your goal" data-testid="goal-card" className="mt-4 rounded-tile bg-well p-3 text-body text-fg">
            <span className="font-semibold">Your goal:</span> {state.goal}
          </p>
        )}
        <ol className="mt-5 divide-y divide-line border-t border-line">
          {STEPS.map((step, i) => (
            <li key={step.key} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <span className={cx("text-body", i <= current ? "text-fg" : "text-fg-muted")}>{step.label}</span>
              {i < current ? (
                <span className="inline-flex items-center gap-1.5 text-label text-fg">
                  <Icon name="check" size={14} className="text-fg-subtle" />
                  Done
                </span>
              ) : i === current ? (
                <ScoringLabel />
              ) : (
                <span className="text-label text-fg-muted">Next</span>
              )}
            </li>
          ))}
        </ol>
      </Card>
      <AnswerCard transcript={state.transcript} durationMs={state.durationMs} empty="Your transcript will appear here in a moment." />
    </div>
  );
}

/** Couldn't score: too short to rate, or no speech found. "Record again" is the black button. */
export function NotScoredResult({
  state,
  recordHref,
  audio,
  demo = false,
}: {
  state: Extract<ResultPageState, { kind: "not_scored" }>;
  recordHref?: ActionTarget;
  audio?: AnswerAudio | null;
  /** Mock data: the "Demo result" label. Never for a real attempt. */
  demo?: boolean;
}) {
  const tooShort = state.reason === "too_short";
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4">
      <Card aria-labelledby="result-title">
        {demo && <DemoLabel className="mb-3" />}
        <p className="text-caption text-fg-muted">Your result · {state.task.title}</p>
        <h1 id="result-title" className="mt-2 text-title font-medium tracking-[-0.01em] text-fg">
          We couldn&rsquo;t score this answer
        </h1>
        <p className="mt-2 text-body text-fg">
          {tooShort
            ? state.task.part === 1
              ? `It was too short to rate${state.wordCount !== null ? ` (${state.wordCount} words)` : ""}. Answer every question when you hear the chime, with a reason or a detail.`
              : `It was too short to rate${state.wordCount !== null ? ` (${state.wordCount} words)` : ""}. Part ${state.task.part} needs about two minutes: answer every question, each with a reason or an example.`
            : "We couldn't hear enough speech in the recording. Check that the right microphone is selected, then record again."}
        </p>
        <p className="mt-5 text-caption font-semibold text-fg">Answer all {state.task.prompts.length} questions</p>
        <ol className="mt-2 space-y-2">
          {state.task.prompts.map((prompt, i) => (
            <li key={prompt} className="flex gap-3 text-body text-fg">
              <span className="w-4 shrink-0 font-semibold">{(state.task.delivery?.firstQuestionNumber ?? 1) + i}</span>
              {prompt}
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <Action target={recordHref ?? practiceHref(state.task)} icon="mic" className="w-full sm:w-auto">
            Record again
          </Action>
        </div>
      </Card>
      <AnswerCard
        transcript={state.transcript}
        durationMs={state.durationMs}
        audio={audio}
        empty={tooShort ? "No transcript." : "No speech was found in the recording."}
      />
    </div>
  );
}

/**
 * Any other failure: the app's existing student-facing copy. When processing can run again on the saved recording,
 * "Try again" (`onTryAgain`) is the black button unless the copy says to record again; the other action is quiet.
 */
export function FailedResult({
  state,
  recordHref,
  onTryAgain,
  isRetrying = false,
  retryError = null,
  demo = false,
  audio,
}: {
  state: Extract<ResultPageState, { kind: "failed" }>;
  /** Mock data: the "Demo result" label. Never for a real attempt. */
  demo?: boolean;
  /** The stored recording, shown with the transcript when AI scoring is not ready (the answer is never lost). */
  audio?: AnswerAudio | null;
  recordHref?: ActionTarget;
  onTryAgain?: (() => void) | null;
  isRetrying?: boolean;
  retryError?: string | null;
}) {
  if (state.aiPending) {
    return <AiPendingResult state={state} recordHref={recordHref} audio={audio} onTryAgain={onTryAgain} isRetrying={isRetrying} retryError={retryError} demo={demo} />;
  }
  const copy = describeFailure(state.failure);
  const canTryAgain = Boolean(onTryAgain) && copy.canRetryProcessing;
  const tryAgainFirst = canTryAgain && !copy.suggestReRecord;
  return (
    <div className="mx-auto max-w-2xl">
      <Card aria-labelledby="result-title">
        {demo && <DemoLabel className="mb-3" />}
        <p className="text-caption text-fg-muted">Your result · {state.task.title}</p>
        <h1 id="result-title" className="mt-2 text-title font-medium tracking-[-0.01em] text-fg">
          {copy.title}
        </h1>
        <p className="mt-2 text-body text-fg">{copy.message}</p>
        {retryError && (
          <p role="alert" className="mt-3 rounded-tile bg-well p-3 text-body text-fg">
            <span className="font-semibold">That didn&rsquo;t work.</span> {retryError}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {canTryAgain && (
            <PillAction
              onClick={onTryAgain!}
              variant={tryAgainFirst ? "primary" : "quiet"}
              icon="retry"
              disabled={isRetrying}
              className="w-full sm:w-auto"
            >
              {isRetrying ? "Trying again…" : "Try again"}
            </PillAction>
          )}
          <Action target={recordHref ?? practiceHref(state.task)} variant={tryAgainFirst ? "quiet" : "primary"} icon="mic" className="w-full sm:w-auto">
            Record again
          </Action>
        </div>
        {canTryAgain && <p className="mt-3 text-label text-fg-muted">Your recording is saved, so &ldquo;Try again&rdquo; doesn&rsquo;t need a new answer.</p>}
      </Card>
    </div>
  );
}

export function BackLink({ mock = false, href, label = "Dashboard" }: { mock?: boolean; href?: string; label?: string }) {
  return (
    <Link href={href ?? mockLink("/dashboard", mock)} className={cx("inline-flex min-h-11 items-center gap-1 text-label text-fg-muted hover:text-fg", styles.FOCUS_RING)}>
      <Icon name="chevronDown" size={14} className="rotate-90" />
      {label}
    </Link>
  );
}


/**
 * AI scoring could not run (no key, no credit, a provider error) but the recording and transcript are saved. Not an
 * error screen: "AI score not ready yet", the transcript and the recording, and "Check again" (the saved recording is
 * scored when the AI scorer is available). Docs: v1-plan.md, "AI scoring and teacher marking are built side by side".
 */
function AiPendingResult({
  state,
  recordHref,
  audio,
  onTryAgain,
  isRetrying,
  retryError,
  demo,
}: {
  state: Extract<ResultPageState, { kind: "failed" }>;
  recordHref?: ActionTarget;
  audio?: AnswerAudio | null;
  onTryAgain?: (() => void) | null;
  isRetrying: boolean;
  retryError: string | null;
  demo: boolean;
}) {
  const canCheck = Boolean(onTryAgain);
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4">
      <Card aria-labelledby="result-title" data-testid="ai-not-ready">
        {demo && <DemoLabel className="mb-3" />}
        <p className="text-caption text-fg-muted">Your result · {state.task.title}</p>
        <h1 id="result-title" className="mt-2 text-title font-medium tracking-[-0.01em] text-fg">
          AI score not ready yet
        </h1>
        <p className="mt-2 text-body text-fg">
          Your recording and what you said are saved. The AI score isn&rsquo;t available right now, so there is no band yet.
          {canCheck ? " Check again in a little while: your recording is scored without recording a new answer." : ""}
        </p>
        {retryError && (
          <p role="alert" className="mt-3 rounded-tile bg-well p-3 text-body text-fg">
            <span className="font-semibold">That didn&rsquo;t work.</span> {retryError}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {canCheck ? (
            <>
              <PillAction onClick={onTryAgain!} icon="retry" disabled={isRetrying} className="w-full sm:w-auto">
                {isRetrying ? "Checking…" : "Check again"}
              </PillAction>
              <Action target={recordHref ?? practiceHref(state.task)} variant="quiet" icon="mic" className="w-full sm:w-auto">
                Record again
              </Action>
            </>
          ) : (
            <Action target={recordHref ?? practiceHref(state.task)} icon="mic" className="w-full sm:w-auto">
              Record again
            </Action>
          )}
        </div>
      </Card>
      <AnswerCard transcript={state.transcript} durationMs={state.durationMs} audio={audio} empty="No transcript." />
    </div>
  );
}

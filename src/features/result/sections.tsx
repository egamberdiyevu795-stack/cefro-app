import Link from "next/link";
import { Card, CardHeader, ComingSoonButton, DeltaLabel, Icon, PillButton, ScoringLabel, cx, styles, type IconName } from "@/components/ds";
import type { FeatureFlags } from "@/config/features";
import { describeFailure } from "@/features/speaking-practice/lib/failure-messages";
import { GOAL_LABEL, formatDuration, type QuestionVerdict, type ResultPageState, type ResultView } from "./view-model";

/*
 * Result page sections. Built only from components/ds and the design-system tokens; values come from the view model.
 * One black (primary) action per screen: "Retry with this goal" on a result, "Record again" when it couldn't be scored,
 * none while scoring.
 */

type Task = { id: string; title: string; part: number; prompts: readonly string[] };

const practiceHref = (task: { id: string }) => `/practice/speaking/${task.id}`;

/* --------------------------------------------------------------------------------------------------- scored result */

/**
 * Phone, top to bottom: result, questions, biggest fix, skills, your answer.
 * Desktop: [result, biggest fix, your answer] | [questions, skills]. The columns are `display: contents` on phones so
 * the cards take their own `order`.
 */
export function ScoredResult({ view, task, flags }: { view: ResultView; task: Task; flags: FeatureFlags }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.62fr)] lg:items-start">
      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <ResultCard view={view} className="order-1 lg:order-none" />
        <BiggestFixCard view={view} task={task} flags={flags} className="order-3 lg:order-none" />
        <AnswerCard transcript={view.transcript} durationMs={view.durationMs} flags={flags} className="order-5 lg:order-none" />
      </div>
      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <QuestionsCard view={view} className="order-2 lg:order-none" />
        <SkillsCard view={view} className="order-4 lg:order-none" />
      </div>
    </div>
  );
}

const ZERO_TEXT: Partial<Record<NonNullable<ResultView["zeroReason"]>, string>> = {
  below_B1: "Band 0 because the language is below B1, even with every question answered.",
  memorized_or_irrelevant: "Band 0 because the answer doesn't answer these questions: it sounds prepared or is about something else.",
  no_question_on_topic: "Band 0 because no question was answered.",
};

function ResultCard({ view, className }: { view: ResultView; className?: string }) {
  const retry = view.retry;
  const change = retry ? retry.band - retry.previousBand : 0;
  return (
    <Card aria-labelledby="result-title" className={className}>
      <p className="text-caption text-fg-muted">Your result · {view.taskTitle}</p>
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
            </span>
          )}
        </div>
      )}
      <h1 id="result-title" className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1" aria-label={view.headline}>
        <span className="text-lead font-medium text-fg-muted">Part {view.part} ·</span>
        <span className="text-stat font-light tracking-[-0.03em] text-fg">Band {view.band}</span>
        <span className="text-lead font-medium text-fg">· {view.bandLabel}</span>
      </h1>

      <BandMeter band={view.band} bandMax={view.bandMax} target={view.target.band} className="mt-5" />
      <p className="mt-3 text-body text-fg">{view.target.text}</p>
      {view.zeroReason && ZERO_TEXT[view.zeroReason] && <p className="mt-1 text-label text-fg-muted">{ZERO_TEXT[view.zeroReason]}</p>}
      {view.provisional && <p className="mt-1 text-label text-fg-muted">Pronunciation wasn&rsquo;t checked in this attempt.</p>}
      {retry?.goalText && (
        <p className="mt-4 border-t border-line pt-3 text-label text-fg-muted">
          Last goal: <span className="text-fg">{retry.goalText}</span>
        </p>
      )}
    </Card>
  );
}

/** One segment per band (0…max, band 0 exists): filled up to the band; the target segment is named under it. Not colour alone: the words carry it. */
function BandMeter({ band, bandMax, target, className }: { band: number; bandMax: number; target: number; className?: string }) {
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
                <span className="text-body font-semibold text-fg">Question {q.id}</span>
                <span className="shrink-0 text-label font-medium text-fg">{q.verdictLabel}</span>
              </p>
              <p className="text-label text-fg-muted">{q.prompt}</p>
              <p className="mt-1 text-body text-fg">{q.reason}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function BiggestFixCard({ view, task, flags, className }: { view: ResultView; task: Task; flags: FeatureFlags; className?: string }) {
  const { fix } = view;
  return (
    <Card aria-labelledby="fix-title" className={className}>
      <CardHeader id="fix-title" title="Biggest fix" />
      <p className="text-caption text-fg-muted">{fix.label}</p>
      <p className="mt-3 text-caption text-fg-muted">{fix.quoteKind === "student" ? "You said" : "You didn't answer"}</p>
      {fix.quoteKind === "student" ? (
        <blockquote className="mt-1 border-l-2 border-accent pl-3 text-body text-fg">“{fix.quote}”</blockquote>
      ) : (
        <p className="mt-1 text-body text-fg">{fix.quote}</p>
      )}
      <p className="mt-4 text-caption text-fg-muted">Try instead</p>
      <p className="mt-1 text-lead font-medium text-fg">{fix.tryInstead}</p>
      {(fix.goal || fix.check) && (
        <div className="mt-5 rounded-tile bg-well p-3">
          {fix.goal && (
            <>
              <p className="text-caption font-semibold text-fg">Goal for your retry</p>
              <p className="mt-1 text-body text-fg">{fix.goal}</p>
            </>
          )}
          {fix.check && <p className={cx("text-label text-fg-muted", fix.goal && "mt-2")}>You&rsquo;ll know it worked: {fix.check}</p>}
        </div>
      )}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <PillButton href={practiceHref(task)} icon="retry" className="w-full sm:w-auto">
          Retry with this goal
        </PillButton>
        {flags.fixLesson && (
          <ComingSoonButton label="Lesson for this fix" className={cx(styles.PILL_QUIET, "w-full sm:w-auto")}>
            <Icon name="book" size={16} />
            Lesson for this fix
          </ComingSoonButton>
        )}
      </div>
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
                    {s.quote && <blockquote className="border-l-2 border-accent pl-3 text-body text-fg">“{s.quote}”</blockquote>}
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
  transcript,
  durationMs,
  flags,
  empty,
  className,
}: {
  transcript: string | null;
  durationMs: number;
  flags: FeatureFlags;
  /** Shown instead of the transcript when there is none. */
  empty?: string;
  className?: string;
}) {
  return (
    <Card aria-labelledby="answer-title" className={className}>
      <CardHeader
        id="answer-title"
        title="Your answer"
        action={
          <span className="inline-flex items-center gap-1.5 text-label text-fg-muted">
            <Icon name="clock" size={14} className="text-fg-subtle" />
            {formatDuration(durationMs)}
          </span>
        }
      />
      {flags.recordingPlayback && (
        <ComingSoonButton label="Play recording" className={cx(styles.PILL_QUIET, "mb-4")}>
          <Icon name="play" size={16} />
          Play recording
        </ComingSoonButton>
      )}
      <p className="text-caption text-fg-muted">Transcript</p>
      {transcript ? <p className="mt-1 text-body text-fg">{transcript}</p> : <p className="mt-1 text-body text-fg-muted">{empty}</p>}
    </Card>
  );
}

/* ---------------------------------------------------------------------------------------------------- other states */

const STEPS = [
  { key: "saved", label: "Recording saved" },
  { key: "transcribing", label: "Writing down what you said" },
  { key: "scoring", label: "Scoring your answer" },
] as const;

/** Waiting for the result. No black button: there is nothing to do yet. */
export function ScoringResult({ state, flags }: { state: Extract<ResultPageState, { kind: "scoring" }>; flags: FeatureFlags }) {
  const current = STEPS.findIndex((s) => s.key === state.step);
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4">
      <Card aria-labelledby="result-title">
        <p className="text-caption text-fg-muted">Your result · {state.task.title}</p>
        <h1 id="result-title" className="mt-2 text-stat font-light tracking-[-0.03em] text-fg">
          Scoring…
        </h1>
        <p className="mt-3 text-body text-fg-muted">This usually takes under a minute. You can leave this page; the result will wait for you.</p>
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
      <AnswerCard transcript={state.transcript} durationMs={state.durationMs} flags={flags} empty="Your transcript will appear here in a moment." />
    </div>
  );
}

/** Couldn't score: too short to rate, or no speech found. "Record again" is the black button. */
export function NotScoredResult({ state, flags }: { state: Extract<ResultPageState, { kind: "not_scored" }>; flags: FeatureFlags }) {
  const tooShort = state.reason === "too_short";
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4">
      <Card aria-labelledby="result-title">
        <p className="text-caption text-fg-muted">Your result · {state.task.title}</p>
        <h1 id="result-title" className="mt-2 text-title font-medium tracking-[-0.01em] text-fg">
          We couldn&rsquo;t score this answer
        </h1>
        <p className="mt-2 text-body text-fg">
          {tooShort
            ? `It was too short to rate${state.wordCount !== null ? ` (${state.wordCount} words)` : ""}. Part ${state.task.part} needs about two minutes: answer every question, each with a reason or an example.`
            : "We couldn't hear enough speech in the recording. Check that the right microphone is selected, then record again."}
        </p>
        <p className="mt-5 text-caption font-semibold text-fg">Answer all {state.task.prompts.length} questions</p>
        <ol className="mt-2 space-y-2">
          {state.task.prompts.map((prompt, i) => (
            <li key={prompt} className="flex gap-3 text-body text-fg">
              <span className="w-4 shrink-0 font-semibold">{i + 1}</span>
              {prompt}
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <PillButton href={practiceHref(state.task)} icon="mic" className="w-full sm:w-auto">
            Record again
          </PillButton>
        </div>
      </Card>
      <AnswerCard
        transcript={state.transcript}
        durationMs={state.durationMs}
        flags={flags}
        empty={tooShort ? "No transcript." : "No speech was found in the recording."}
      />
    </div>
  );
}

/** Any other failure: the app's existing student-facing copy. */
export function FailedResult({ state }: { state: Extract<ResultPageState, { kind: "failed" }> }) {
  const copy = describeFailure(state.failure);
  return (
    <div className="mx-auto max-w-2xl">
      <Card aria-labelledby="result-title">
        <p className="text-caption text-fg-muted">Your result · {state.task.title}</p>
        <h1 id="result-title" className="mt-2 text-title font-medium tracking-[-0.01em] text-fg">
          {copy.title}
        </h1>
        <p className="mt-2 text-body text-fg">{copy.message}</p>
        <div className="mt-6">
          <PillButton href={practiceHref(state.task)} icon="mic">
            Record again
          </PillButton>
        </div>
      </Card>
    </div>
  );
}

export function BackLink() {
  return (
    <Link href="/dashboard" className={cx("inline-flex min-h-11 items-center gap-1 text-label text-fg-muted hover:text-fg", styles.FOCUS_RING)}>
      <Icon name="chevronDown" size={14} className="rotate-90" />
      Dashboard
    </Link>
  );
}

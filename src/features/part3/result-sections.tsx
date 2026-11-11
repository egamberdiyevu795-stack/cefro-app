import { Card, CardHeader, DeltaLabel, DemoLabel, Icon, Notice, PillButton, cx, styles, type IconName } from "@/components/ds";
import { audioRetentionNote } from "@/domain/audio-retention";
import { BandMeter, type AnswerAudio } from "@/features/result/sections";
import { formatDuration } from "@/features/result/view-model";
import { RecordingPlayer } from "@/features/speaking-practice/components/RecordingPlayer";
import { GOAL_TEXT, type Part3ResultView, type PointVerdict, type SideView } from "./view-model";

/*
 * The Part 3 result page, built only from components/ds and the design-system tokens; values come from the view
 * model. One black action: "Retry with this goal".
 *
 * Phone, top to bottom: result → your points (FOR / AGAINST) → biggest fix → words from the list → skills → your
 * answer. Desktop: [result, biggest fix, your answer] | [your points, words from the list, skills].
 */

const VERDICT_ICON: Record<PointVerdict, IconName> = { developed: "check", stated: "partly", not_used: "cross", misread: "cross" };

export function Part3ScoredResult({
  view,
  retryHref,
  demo,
  audio = null,
}: {
  view: Part3ResultView;
  retryHref: string;
  demo: boolean;
  /** A real attempt's stored recording: a player, or the retention note once it is deleted. Mock results have none. */
  audio?: AnswerAudio | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.7fr)] lg:items-start">
      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <ResultCard view={view} demo={demo} className="order-1 lg:order-none" />
        <FixCard view={view} retryHref={retryHref} className="order-3 lg:order-none" />
        <AnswerCard view={view} audio={audio} className="order-6 lg:order-none" />
      </div>
      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <PointsCard view={view} className="order-2 lg:order-none" />
        <DependenceCard view={view} className="order-4 lg:order-none" />
        <SkillsCard view={view} className="order-5 lg:order-none" />
      </div>
    </div>
  );
}

function ResultCard({ view, demo, className }: { view: Part3ResultView; demo: boolean; className?: string }) {
  const retry = view.retry;
  const change = retry ? retry.band - retry.previousBand : 0;
  return (
    <Card aria-labelledby="result-title" className={className}>
      {demo && <DemoLabel className="mb-3" />}
      <p className="text-caption text-fg-muted">Your result · {view.taskTitle}</p>
      {retry && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-label font-semibold text-fg">
            Band {retry.previousBand} → {retry.band}
          </span>
          {change > 0 && <DeltaLabel label={`Up ${change} ${change === 1 ? "band" : "bands"} from your last attempt`}>+{change} {change === 1 ? "band" : "bands"}</DeltaLabel>}
          {retry.goal && (
            <span data-testid="goal-outcome" className="inline-flex items-center gap-1 text-label text-fg">
              <span aria-hidden="true" className="text-fg-muted">·</span>
              <Icon name={retry.goal === "met" ? "check" : retry.goal === "partly" ? "partly" : "cross"} size={14} className="text-fg-subtle" />
              {GOAL_TEXT[retry.goal]}
              {retry.goal === "partly" && <span className="text-fg-muted">· partly there</span>}
            </span>
          )}
        </div>
      )}
      <h1 id="result-title" className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1" aria-label={view.headline}>
        <span className="text-lead font-medium text-fg-muted">Part 3 ·</span>
        <span className="text-stat font-light tracking-[-0.03em] text-fg">Band {view.band}</span>
        <span className="text-lead font-medium text-fg">· {view.bandLabel}</span>
      </h1>
      <p className="mt-1 text-label text-fg-muted">{view.statement}</p>
      <BandMeter band={view.band} bandMax={view.bandMax} target={view.targetBand} className="mt-5" />
      <p className="mt-3 text-body text-fg">{view.targetText}</p>
      {view.zeroText && <p className="mt-1 text-label text-fg-muted">{view.zeroText}</p>}
      {view.provisional && <p className="mt-1 text-label text-fg-muted">Pronunciation wasn&rsquo;t checked in this attempt.</p>}
      {retry?.goalText && (
        <p className="mt-4 border-t border-line pt-3 text-label text-fg-muted">
          Your goal: <span className="text-fg">{retry.goalText}</span>
        </p>
      )}
      {view.developmentEvaluator && (
        <p data-testid="development-evaluator" className="mt-4 rounded-tile bg-well p-3 text-label text-fg">
          <span className="font-semibold">Development evaluator.</span> This result comes from the local test evaluator, not a real assessment.
        </p>
      )}
    </Card>
  );
}

function PointsCard({ view, className }: { view: Part3ResultView; className?: string }) {
  return (
    <Card aria-labelledby="points-title" className={className} data-testid="points-card">
      <CardHeader id="points-title" title="Your points" />
      {view.chooseTwo && (
        <Notice tone="alert" className="mb-4" data-testid="choose-two">
          Choose two points from each list.
        </Notice>
      )}
      <div className="flex flex-col gap-5">
        {view.sides.map((side) => (
          <SideList key={side.side} side={side} />
        ))}
      </div>
      {view.ownPoints.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-caption font-semibold text-fg">Good extra argument</p>
          {view.ownPoints.map((p) => (
            <blockquote key={p.quote} className="mt-2 border-l-2 border-accent pl-3 text-body text-fg">
              &ldquo;{p.quote}&rdquo;
            </blockquote>
          ))}
          <p className="mt-2 text-label text-fg-muted">Your own arguments are welcome, but only points from the lists count.</p>
        </div>
      )}
    </Card>
  );
}

function SideList({ side }: { side: SideView }) {
  return (
    <section aria-label={`${side.title} list`}>
      <p className="flex items-baseline justify-between gap-3">
        <span className="text-label font-semibold text-fg">{side.title}</span>
        <span className="text-label text-fg-muted">{side.summary}</span>
      </p>
      <ol className="mt-1 divide-y divide-line">
        {side.points.map((p) => (
          <li key={p.id} data-testid={`point-${p.id}`} className="flex gap-3 py-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-well text-fg">
              <Icon name={VERDICT_ICON[p.verdict]} size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-body font-semibold text-fg">
                  {p.id} <span className="font-normal">{p.text}</span>
                </span>
                <span className="text-label font-medium text-fg">{p.verdictLabel}</span>
              </p>
              {p.chosen && <p className="text-caption text-fg-muted">You chose this point</p>}
              {p.quote && <blockquote className="mt-1.5 border-l-2 border-accent pl-3 text-label text-fg">&ldquo;{p.quote}&rdquo;</blockquote>}
              {p.verdict !== "developed" && p.verdict !== "not_used" && p.note && <p className="mt-1 text-label text-fg-muted">{p.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FixCard({ view, retryHref, className }: { view: Part3ResultView; retryHref: string; className?: string }) {
  const { fix } = view;
  return (
    <Card aria-labelledby="fix-title" className={className}>
      <CardHeader id="fix-title" title="Biggest fix" />
      <p className="text-caption text-fg-muted">{fix.label}</p>
      <p className="mt-3 text-caption text-fg-muted">{fix.quoteLabel}</p>
      {fix.quoteKind === "student" ? (
        <blockquote className="mt-1 border-l-2 border-accent pl-3 text-body text-fg">&ldquo;{fix.quote}&rdquo;</blockquote>
      ) : (
        <p className="mt-1 text-body text-fg">{fix.quote}</p>
      )}
      <p className="mt-4 text-caption text-fg-muted">{fix.adviceLabel}</p>
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
      <div className="mt-5">
        <PillButton href={retryHref} icon="retry" className="w-full sm:w-auto">
          Retry with this goal
        </PillButton>
      </div>
    </Card>
  );
}

function DependenceCard({ view, className }: { view: Part3ResultView; className?: string }) {
  const { dependence } = view;
  return (
    <Card aria-labelledby="dependence-title" className={className} data-testid="dependence-card">
      <CardHeader id="dependence-title" title="Words from the list" action={<span className="text-label font-medium text-fg">{dependence.label}</span>} />
      {dependence.copied.length > 0 ? (
        <>
          <p className="text-body text-fg">These sentences repeat the lists word for word, with nothing of your own after them:</p>
          <ul className="mt-2 space-y-2">
            {dependence.copied.map((sentence) => (
              <li key={sentence}>
                <blockquote className="border-l-2 border-accent pl-3 text-body text-fg">&ldquo;{sentence}&rdquo;</blockquote>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-body text-fg">No sentence repeats the lists without your own words after it.</p>
      )}
      {dependence.note && <p className="mt-2 text-label text-fg-muted">{dependence.note}</p>}
    </Card>
  );
}

function SkillsCard({ view, className }: { view: Part3ResultView; className?: string }) {
  return (
    <Card aria-labelledby="skills-title" className={className}>
      <CardHeader id="skills-title" title="Skills" />
      <ul className="-my-1 divide-y divide-line">
        {view.skills.map((s) => (
          <li key={s.feature}>
            <details className="group">
              <summary className={cx("flex min-h-11 cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden", styles.FOCUS_RING)}>
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
                  <p className="text-body text-fg-muted">Pronunciation wasn&rsquo;t checked in this attempt.</p>
                ) : (
                  <>
                    {s.quote && <blockquote className="border-l-2 border-accent pl-3 text-body text-fg">&ldquo;{s.quote}&rdquo;</blockquote>}
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

function AnswerCard({ view, audio, className }: { view: Part3ResultView; audio: AnswerAudio | null; className?: string }) {
  const anyCopied = view.transcript.some((p) => p.copied);
  const retentionNote = audio ? audioRetentionNote({ deletedAt: audio.deletedAt ?? null, deletesAt: audio.deletesAt ?? null }) : null;
  return (
    <Card aria-labelledby="answer-title" className={className}>
      <CardHeader
        id="answer-title"
        title="Your answer"
        action={
          <span className="inline-flex items-center gap-1.5 text-label text-fg-muted">
            <Icon name="clock" size={14} className="text-fg-subtle" />
            {formatDuration(view.durationMs)}
          </span>
        }
      />
      {audio && (
        <div className="mb-4">
          {!audio.deletedAt && <RecordingPlayer src={audio.src} durationMs={audio.durationMs} label="Your recorded answer" />}
          {retentionNote && (
            <p data-testid="audio-retention" className={cx("text-label text-fg-muted", !audio.deletedAt && "mt-2")}>
              {retentionNote}
            </p>
          )}
        </div>
      )}
      <p className="text-caption text-fg-muted">Transcript</p>
      <p className="mt-1 text-body text-fg" data-testid="transcript">
        {view.transcript.map((piece, i) =>
          piece.copied ? (
            <mark key={i} className="rounded-sm bg-well px-0.5 text-fg underline decoration-dotted underline-offset-4">
              <span className="sr-only">(from the list) </span>
              {piece.text}
            </mark>
          ) : (
            <span key={i}>{piece.text}</span>
          ),
        )}
      </p>
      {anyCopied && <p className="mt-2 text-label text-fg-muted">Dotted underline: words read from the lists.</p>}
    </Card>
  );
}

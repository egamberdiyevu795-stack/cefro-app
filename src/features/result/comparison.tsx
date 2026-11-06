import { Card, CardHeader, DeltaLabel, Icon, cx, styles } from "@/components/ds";
import { FEATURE_LABELS, LEVEL_LABELS, type PronunciationLevel } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { SpeechMetrics } from "@/domain/speaking/metrics";
import { compareAttempts, type ComparisonVerdict, type FeatureComparison } from "@/domain/speaking/comparison";
import { Action, type ActionTarget } from "./sections";
import { formatDuration } from "./view-model";

/*
 * The retry comparison: attempt N-1 vs attempt N, on the design system. Every value comes from the two stored
 * evaluations (domain/speaking/comparison.ts): a one-band change is "slight" and never shown as progress on its own.
 * One black button: "Retry with this goal" (the newer attempt's first retry focus).
 */

export interface ComparedAttempt {
  attemptNumber: number;
  result: MultilevelResult;
  metrics: SpeechMetrics | null;
  /** Evaluator and rubric version: a change is flagged, since bands may then not compare. */
  methodology: string;
  transcript: string;
}

const VERDICT: Record<ComparisonVerdict, { title: string; body: string }> = {
  clear_improvement: { title: "Your answer is clearly better.", body: "The changes below are big enough to count as real progress." },
  slight_improvement: {
    title: "Slightly better, but the difference is small.",
    body: "A band can move by one between similar answers. Another attempt will show if this holds.",
  },
  about_the_same: { title: "About the same as last time.", body: "Use the goal below to make one clear change next time." },
  mixed: { title: "Some things improved, others got worse.", body: "Look at what changed below, and keep what worked." },
  slight_decline: { title: "Slightly lower, but within normal variation.", body: "This is not a real step back yet, but it isn't progress either." },
  clear_decline: { title: "This attempt scored lower.", body: "That happens. Check the goal below and try once more." },
};

const OUTCOME: Record<"achieved" | "partly_achieved" | "not_achieved", { label: string; icon: "check" | "partly" | "cross" }> = {
  achieved: { label: "Goal met", icon: "check" },
  partly_achieved: { label: "Not yet · partly there", icon: "partly" },
  not_achieved: { label: "Not yet", icon: "cross" },
};

const level = (l: PronunciationLevel) => (l === "not_assessed" ? "Not assessed" : LEVEL_LABELS[l]);

export function ComparisonResult({
  before,
  after,
  taskTitle,
  onRetry,
  onBack,
}: {
  before: ComparedAttempt;
  after: ComparedAttempt;
  taskTitle: string;
  onRetry: ActionTarget;
  onBack: ActionTarget;
}) {
  const comparison = compareAttempts(
    { evaluation: before.result, metrics: before.metrics, methodology: before.methodology },
    { evaluation: after.result, metrics: after.metrics, methodology: after.methodology },
  );
  const verdict = VERDICT[comparison.verdict];
  const { band, questions } = comparison;
  const change = band.after - band.before;
  const review = after.result.assessment.retry_review;
  const next = comparison.practiceNext[0];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.62fr)] lg:items-start">
      <div className="flex flex-col gap-4">
        <Card aria-labelledby="compare-title">
          <p className="text-caption text-fg-muted">Your retry · {taskTitle}</p>
          <h1 id="compare-title" className="mt-1 text-title font-medium tracking-[-0.01em] text-fg">
            Attempt {before.attemptNumber} vs Attempt {after.attemptNumber}
          </h1>
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <BandTile label={`Attempt ${before.attemptNumber}`} band={band.before} name={band.beforeLabel} muted />
            <Icon name="chevronDown" size={20} className="-rotate-90 text-fg-subtle" />
            <BandTile label={`Attempt ${after.attemptNumber}`} band={band.after} name={band.afterLabel} />
          </div>
          {change > 0 && (
            <p className="mt-3">
              <DeltaLabel>
                +{change} {change === 1 ? "band" : "bands"}
              </DeltaLabel>
            </p>
          )}
          <p className="mt-4 text-body font-semibold text-fg">{verdict.title}</p>
          <p className="mt-1 text-body text-fg-muted">{verdict.body}</p>
          {comparison.methodologyChanged && (
            <p className="mt-3 rounded-tile bg-well p-3 text-label text-fg">
              <span className="font-semibold">Scored with different versions of our evaluator.</span> We changed how answers are
              assessed between these attempts, so compare the bands with care.
            </p>
          )}
        </Card>

        {review && review.objectives.length > 0 && (
          <Card aria-labelledby="goal-title">
            <CardHeader id="goal-title" title="Your goal" />
            <ul className="-my-1 divide-y divide-line">
              {review.objectives.map((o) => (
                <li key={o.objective} className="py-3">
                  <p className="flex items-center gap-1.5 text-label font-semibold text-fg">
                    <Icon name={OUTCOME[o.outcome].icon} size={14} className="text-fg-subtle" />
                    {OUTCOME[o.outcome].label}
                  </p>
                  <p className="mt-1 text-body text-fg">{o.objective}</p>
                  {o.evidence && <p className="mt-1 text-label text-fg-muted">{o.evidence}</p>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card aria-labelledby="next-title">
          <CardHeader id="next-title" title="Practise next" />
          {next ? (
            <div className="rounded-tile bg-well p-3">
              <p className="text-body text-fg">
                <span className="font-semibold">Your goal:</span> {next.objective}
              </p>
              {next.success_check && <p className="mt-1 text-label text-fg-muted">You&rsquo;ll know it worked: {next.success_check}</p>}
            </div>
          ) : (
            <p className="text-body text-fg-muted">No new goal this time: retry to check the result holds.</p>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Action target={onRetry} icon="retry" className="w-full sm:w-auto">
              Retry with this goal
            </Action>
            <Action target={onBack} variant="quiet" className="w-full sm:w-auto">
              Back to attempt {after.attemptNumber} result
            </Action>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card aria-labelledby="changes-title">
          <CardHeader id="changes-title" title="What changed" />
          <table className="w-full">
            <caption className="sr-only">Level of each skill, before and after</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Skill</th>
                <th scope="col">Before → after</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <th scope="row" className="py-2.5 text-left text-body font-semibold text-fg">
                  Questions counted
                </th>
                <td className="py-2.5 text-right text-body text-fg tabular-nums">
                  {questions.before} → <span className="font-semibold">{questions.after}</span> of {questions.total}
                </td>
                <td className="py-2.5 pl-3 text-right">
                  <ChangeWord direction={questions.after > questions.before ? "improved" : questions.after < questions.before ? "declined" : "same"} />
                </td>
              </tr>
              {comparison.features.map((row) => (
                <tr key={row.feature}>
                  <th scope="row" className="py-2.5 text-left text-body font-semibold text-fg">
                    {FEATURE_LABELS[row.feature]}
                  </th>
                  <td className="py-2.5 text-right text-body text-fg">
                    {row.before === "not_assessed" && row.after === "not_assessed" ? (
                      <span className="text-fg-muted">Not assessed</span>
                    ) : (
                      <>
                        {level(row.before)} → <span className="font-semibold">{level(row.after)}</span>
                      </>
                    )}
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <ChangeWord direction={row.direction} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {comparison.metrics && (
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4">
              <Metric label="Speaking time" before={formatDuration(comparison.metrics.speakingSeconds.before * 1000)} after={formatDuration(comparison.metrics.speakingSeconds.after * 1000)} />
              <Metric label="Words" before={comparison.metrics.wordCount.before} after={comparison.metrics.wordCount.after} />
              <Metric label="Hesitations" before={comparison.metrics.fillerCount.before} after={comparison.metrics.fillerCount.after} />
            </dl>
          )}
        </Card>

        <Card>
          <details className="group">
            <summary className={cx("flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden", styles.FOCUS_RING)}>
              <span className="text-title font-medium tracking-[-0.01em] text-fg">Both transcripts</span>
              <Icon name="chevronDown" size={16} className="text-fg-subtle transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-4">
              {[before, after].map((a) => (
                <div key={a.attemptNumber}>
                  <p className="text-caption font-semibold text-fg">Attempt {a.attemptNumber}</p>
                  <p className="mt-1 whitespace-pre-line text-body text-fg">{a.transcript}</p>
                </div>
              ))}
            </div>
          </details>
        </Card>
      </div>
    </div>
  );
}

function BandTile({ label, band, name, muted = false }: { label: string; band: number; name: string; muted?: boolean }) {
  return (
    <div className="rounded-tile bg-well p-3">
      <p className="text-caption text-fg-muted">{label}</p>
      <p className={cx("text-stat font-light tracking-[-0.03em]", muted ? "text-fg-muted" : "text-fg")}>Band {band}</p>
      <p className="text-label text-fg-muted">{name}</p>
    </div>
  );
}

/** The change in words (never colour alone); "Up a level" is the only lime label. */
function ChangeWord({ direction }: { direction: FeatureComparison["direction"] }) {
  if (direction === "improved") return <DeltaLabel>Up</DeltaLabel>;
  const text = direction === "declined" ? "Down" : direction === "same" ? "Same" : "—";
  return <span className="text-label text-fg-muted">{direction === "not_comparable" ? <span aria-label="Not comparable">{text}</span> : text}</span>;
}

function Metric({ label, before, after }: { label: string; before: string | number; after: string | number }) {
  return (
    <div>
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd className="text-label text-fg tabular-nums">
        {before} → <span className="font-semibold">{after}</span>
      </dd>
    </div>
  );
}

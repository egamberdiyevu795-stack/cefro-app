import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { FEATURE_LABELS } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import { compareAttempts, type ComparisonVerdict, type FeatureComparison } from "@/domain/speaking/comparison";
import { formatDuration } from "../lib/format";
import { levelText } from "./FeatureLevels";
import type { EvaluatedAttempt } from "./FeedbackReport";
import { RetryReviewCard } from "./RetryReviewCard";

const VERDICT: Record<ComparisonVerdict, { title: string; body: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  clear_improvement: { title: "Your answer is clearly better.", body: "The changes below are big enough to count as real progress.", tone: "success" },
  slight_improvement: {
    title: "Slightly better, but the difference is small.",
    body: "A band can move by one between similar answers. Another attempt will show if this holds.",
    tone: "neutral",
  },
  about_the_same: { title: "About the same as last time.", body: "Use your focus below to make one clear change next time.", tone: "neutral" },
  mixed: { title: "Some things improved, others got worse.", body: "Look at what changed below, and keep what worked.", tone: "warning" },
  slight_decline: {
    title: "Slightly lower, but within normal variation.",
    body: "This is not a real step back yet — but it isn't progress either.",
    tone: "neutral",
  },
  clear_decline: { title: "This attempt scored lower.", body: "That happens. Check the focus below and try once more.", tone: "danger" },
};

/**
 * "Did my second attempt actually improve?" — Attempt N-1 vs Attempt N, by Part band and feature levels.
 * All values come straight from the stored evaluations; a one-band change is labelled as slight and never presented as
 * progress on its own. Older (pre-band) attempts are not compared.
 */
export function ComparisonView({
  before,
  after,
  onRetry,
  onBack,
}: {
  before: EvaluatedAttempt;
  after: EvaluatedAttempt;
  onRetry: () => void;
  onBack: () => void;
}) {
  const a = before.evaluation.result;
  const b = after.evaluation.result;
  if (a.kind !== "multilevel" || b.kind !== "multilevel") {
    return (
      <Alert tone="warning" title="These attempts can't be compared">
        One of them was scored with an older method that has no Part 2 band. Compare two attempts made since the switch to the official band scale.
      </Alert>
    );
  }
  return <MultilevelComparison before={before} after={after} beforeResult={a} afterResult={b} onRetry={onRetry} onBack={onBack} />;
}

function MultilevelComparison({
  before,
  after,
  beforeResult,
  afterResult,
  onRetry,
  onBack,
}: {
  before: EvaluatedAttempt;
  after: EvaluatedAttempt;
  beforeResult: MultilevelResult;
  afterResult: MultilevelResult;
  onRetry: () => void;
  onBack: () => void;
}) {
  const comparison = compareAttempts(
    { evaluation: beforeResult, metrics: before.metrics, methodology: methodologyOf(before) },
    { evaluation: afterResult, metrics: after.metrics, methodology: methodologyOf(after) },
  );
  const verdict = VERDICT[comparison.verdict];
  const { band, questions } = comparison;
  const improved = comparison.features.filter((f) => f.direction === "improved").map((f) => `${FEATURE_LABELS[f.feature]}: ${levelText(f.before)} → ${levelText(f.after)}`);
  if (questions.after > questions.before) improved.unshift(`Questions answered on topic: ${questions.before} → ${questions.after}`);

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <h2 className="text-xl font-semibold">
          Attempt {before.attemptNumber} vs Attempt {after.attemptNumber}
        </h2>
        <div className="flex flex-wrap items-center gap-4 sm:gap-8">
          <BandBlock label={`Attempt ${before.attemptNumber}`} band={band.before} bandMax={band.bandMax} name={band.beforeLabel} />
          <span aria-hidden className="text-2xl text-subtle">→</span>
          <BandBlock label={`Attempt ${after.attemptNumber}`} band={band.after} bandMax={band.bandMax} name={band.afterLabel} highlight />
        </div>
        <div>
          <p className="font-semibold">{verdict.title}</p>
          <p className="mt-1 text-sm text-muted">{verdict.body}</p>
        </div>
        {comparison.methodologyChanged && (
          <Alert tone="warning" title="Scored with different versions of our evaluator">
            We improved how answers are assessed between these attempts, so compare the bands with care.
          </Alert>
        )}
      </Card>

      {afterResult.assessment.retry_review && <RetryReviewCard review={afterResult.assessment.retry_review} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-2">
          <SectionTitle>What improved</SectionTitle>
          {improved.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {improved.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No feature moved up a level this time.</p>
          )}
        </Card>

        <Card>
          <SectionTitle>Feature levels</SectionTitle>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Level per feature, before and after</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-subtle">
                <th className="py-2 font-semibold">Feature</th>
                <th className="py-2 text-right font-semibold">Level</th>
                <th className="py-2 text-right font-semibold">
                  <span className="sr-only">Change</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-3 font-medium">Questions on topic</td>
                <td className="py-3 text-right tabular-nums">
                  {questions.before} → <span className="font-semibold">{questions.after}</span> of {questions.total}
                </td>
                <td />
              </tr>
              {comparison.features.map((row) => (
                <tr key={row.feature}>
                  <td className="py-3 font-medium">{FEATURE_LABELS[row.feature]}</td>
                  <td className="py-3 text-right">
                    {levelText(row.before)} → <span className="font-semibold">{levelText(row.after)}</span>
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <ChangeBadge row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {comparison.metrics && (
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
              <MetricChange label="Speaking time" before={formatDuration(comparison.metrics.speakingSeconds.before)} after={formatDuration(comparison.metrics.speakingSeconds.after)} />
              <MetricChange label="Words" before={comparison.metrics.wordCount.before} after={comparison.metrics.wordCount.after} />
              <MetricChange label="Hesitations" before={comparison.metrics.fillerCount.before} after={comparison.metrics.fillerCount.after} />
            </dl>
          )}
        </Card>
      </div>

      <Card className="space-y-4 border-brand/40 bg-brand-soft/50">
        <div>
          <SectionTitle>Practise next</SectionTitle>
          <ul className="mt-3 space-y-2">
            {comparison.practiceNext.map((focus) => (
              <li key={focus.objective}>
                <p className="font-medium">→ {focus.objective}</p>
                <p className="text-sm text-muted">How to check: {focus.success_check}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={onRetry}>Retry this task again</Button>
          <Button size="lg" variant="secondary" onClick={onBack}>Back to attempt {after.attemptNumber} feedback</Button>
        </div>
      </Card>

      <details className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <summary className="cursor-pointer font-semibold">Compare the two transcripts</summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {[before, after].map((attempt) => (
            <div key={attempt.id}>
              <p className="text-sm font-semibold text-subtle">Attempt {attempt.attemptNumber}</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{attempt.transcript.text}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function methodologyOf(attempt: EvaluatedAttempt): string {
  return `${attempt.evaluation.meta.evaluatorVersion}|${attempt.evaluation.meta.rubricVersion}`;
}

function ChangeBadge({ row }: { row: FeatureComparison }) {
  if (row.direction === "not_comparable") return <Badge>Not assessed</Badge>;
  if (row.direction === "same") return <Badge>Same</Badge>;
  return <Badge tone={row.direction === "improved" ? "success" : "danger"}>{row.direction === "improved" ? "Up a level" : "Down a level"}</Badge>;
}

function BandBlock({ label, band, bandMax, name, highlight = false }: { label: string; band: number; bandMax: number; name: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-subtle">{label}</p>
      <p className={cn("text-4xl font-semibold tracking-tight tabular-nums", highlight ? "text-ink" : "text-muted")}>
        {band}/{bandMax}
      </p>
      <p className="text-sm text-muted">{name}</p>
    </div>
  );
}

function MetricChange({ label, before, after }: { label: string; before: string | number; after: string | number }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="tabular-nums">
        {before} → <span className="font-semibold">{after}</span>
      </dd>
    </div>
  );
}

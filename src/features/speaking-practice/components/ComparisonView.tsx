import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { CRITERION_LABELS } from "@/domain/evaluation/criteria";
import { compareAttempts, type ComparisonVerdict, type CriterionComparison } from "@/domain/speaking/comparison";
import { formatDuration } from "../lib/format";
import type { EvaluatedAttempt } from "./FeedbackReport";
import { RetryReviewCard } from "./RetryReviewCard";

const VERDICT: Record<ComparisonVerdict, { title: string; body: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  clear_improvement: { title: "Your answer is clearly better.", body: "The changes below are big enough to count as real progress.", tone: "success" },
  slight_improvement: {
    title: "Slightly better, but the difference is small.",
    body: "Scores can move by one point between similar answers. Another attempt will show if this holds.",
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
 * "Did my second attempt actually improve?" — Attempt N-1 vs Attempt N.
 * All numbers come straight from the stored evaluations; one-point changes
 * are labelled as slight and never presented as progress on their own.
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
  const comparison = compareAttempts(
    { evaluation: before.evaluation.result, metrics: before.metrics, methodology: methodologyOf(before) },
    { evaluation: after.evaluation.result, metrics: after.metrics, methodology: methodologyOf(after) },
  );
  const verdict = VERDICT[comparison.verdict];
  const improvedLabels = [
    ...comparison.clearlyImproved.map((c) => `${CRITERION_LABELS[c]} score`),
    ...comparison.resolvedCriteria.map((c) => `${CRITERION_LABELS[c]} is no longer a main weakness`),
  ];

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <h2 className="text-xl font-semibold">
          Attempt {before.attemptNumber} vs Attempt {after.attemptNumber}
        </h2>
        <div className="flex flex-wrap items-center gap-4 sm:gap-8">
          <LevelBlock label={`Attempt ${before.attemptNumber}`} level={comparison.overall.before} />
          <span aria-hidden className="text-2xl text-subtle">→</span>
          <LevelBlock label={`Attempt ${after.attemptNumber}`} level={comparison.overall.after} highlight />
        </div>
        <div>
          <p className="font-semibold">{verdict.title}</p>
          <p className="mt-1 text-sm text-muted">{verdict.body}</p>
        </div>
        {comparison.methodologyChanged && (
          <Alert tone="warning" title="Scored with different versions of our evaluator">
            We improved how answers are assessed between these attempts, so compare the scores with care.
          </Alert>
        )}
      </Card>

      {after.evaluation.result.retry_review && <RetryReviewCard review={after.evaluation.result.retry_review} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <div>
            <SectionTitle>What improved</SectionTitle>
            {improvedLabels.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {improvedLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No clear improvement in the scores this time.</p>
            )}
          </div>
          <div>
            <SectionTitle>Still to work on</SectionTitle>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {comparison.remainingIssues.slice(0, 3).map((issue) => (
                <li key={issue.problem}>{issue.problem}</li>
              ))}
            </ul>
          </div>
        </Card>

        <Card>
          <SectionTitle>Scores</SectionTitle>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Score per criterion, before and after</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-subtle">
                <th className="py-2 font-semibold">Criterion</th>
                <th className="py-2 text-right font-semibold">Score</th>
                <th className="py-2 text-right font-semibold">
                  <span className="sr-only">Change</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {comparison.criteria.map((row) => (
                <tr key={row.criterion}>
                  <td className="py-3 font-medium">{CRITERION_LABELS[row.criterion]}</td>
                  <td className="py-3 text-right tabular-nums">
                    {row.before ?? "—"} → <span className="font-semibold">{row.after ?? "—"}</span>
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

function ChangeBadge({ row }: { row: CriterionComparison }) {
  if (row.direction === "not_comparable") return <Badge>Not assessed</Badge>;
  if (row.direction === "same") return <Badge>Same</Badge>;
  const sign = row.delta! > 0 ? "+" : "";
  const label =
    row.direction === "improved"
      ? row.magnitude === "clear" ? "Better" : "Slightly better"
      : row.magnitude === "clear" ? "Lower" : "Slightly lower";
  const tone = row.magnitude === "slight" ? "neutral" : row.direction === "improved" ? "success" : "danger";
  return (
    <Badge tone={tone}>
      {label} ({sign}
      {row.delta})
    </Badge>
  );
}

function LevelBlock({ label, level, highlight = false }: { label: string; level: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-subtle">{label}</p>
      <p className={cn("text-4xl font-semibold tracking-tight", highlight ? "text-ink" : "text-muted")}>{level}</p>
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

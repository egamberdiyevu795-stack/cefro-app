import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { CRITERION_LABELS } from "@/domain/evaluation/criteria";
import { compareAttempts, type ChangeDirection } from "@/domain/speaking/comparison";
import { formatDuration } from "../lib/format";
import type { EvaluatedAttempt } from "./FeedbackReport";
import { RetryReviewCard } from "./RetryReviewCard";

const DIRECTION: Record<ChangeDirection, { label: string; tone: "success" | "danger" | "neutral" }> = {
  improved: { label: "Improved", tone: "success" },
  declined: { label: "Lower", tone: "danger" },
  same: { label: "No change", tone: "neutral" },
  not_comparable: { label: "Not assessed", tone: "neutral" },
};

/**
 * Attempt N-1 vs Attempt N. All numbers come straight from the stored
 * evaluations — nothing here rounds up or reframes a lower score.
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
    { evaluation: before.evaluation.result, metrics: before.metrics },
    { evaluation: after.evaluation.result, metrics: after.metrics },
  );
  const { tally } = comparison;
  const headline =
    tally.improved > 0 && tally.declined === 0
      ? "You improved."
      : tally.improved === 0 && tally.declined > 0
        ? "This attempt scored lower."
        : tally.improved === 0 && tally.declined === 0
          ? "Your scores stayed the same."
          : "Mixed results.";

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
          <Badge tone={DIRECTION[comparison.overall.direction].tone} className="text-sm">
            Overall: {DIRECTION[comparison.overall.direction].label}
          </Badge>
        </div>
        <p className="text-muted">
          <span className="font-semibold text-ink">{headline}</span> {tally.improved} improved · {tally.same} unchanged · {tally.declined} lower.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Scores</SectionTitle>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Score per criterion, before and after</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-subtle">
                <th className="py-2 font-semibold">Criterion</th>
                <th className="py-2 text-right font-semibold">Change</th>
                <th className="py-2 text-right font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {comparison.criteria.map((row) => (
                <tr key={row.criterion}>
                  <td className="py-3 font-medium">{CRITERION_LABELS[row.criterion]}</td>
                  <td className="py-3 text-right tabular-nums">
                    {row.before ?? "—"} → <span className="font-semibold">{row.after ?? "—"}</span>
                    {row.delta !== null && row.delta !== 0 && (
                      <span className={cn("ml-2", row.delta > 0 ? "text-success" : "text-danger")}>
                        ({row.delta > 0 ? "+" : ""}{row.delta})
                      </span>
                    )}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <Badge tone={DIRECTION[row.direction].tone}>{DIRECTION[row.direction].label}</Badge>
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

        <div className="space-y-6">
          {after.evaluation.result.retry_review && <RetryReviewCard review={after.evaluation.result.retry_review} />}
          <Card className="space-y-4">
            <SectionTitle>Weaknesses</SectionTitle>
            <IssueList title={`Identified in attempt ${before.attemptNumber}`} items={before.evaluation.result.issues.map((i) => i.problem)} />
            {comparison.resolvedCriteria.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-success">No longer flagged</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {comparison.resolvedCriteria.map((c) => (
                    <Badge key={c} tone="success">{CRITERION_LABELS[c]}</Badge>
                  ))}
                </div>
              </div>
            )}
            <IssueList title={`Still to work on (attempt ${after.attemptNumber})`} items={comparison.remainingIssues.map((i) => i.problem)} />
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {[before, after].map((attempt) => (
          <Card key={attempt.id}>
            <SectionTitle>Attempt {attempt.attemptNumber} transcript</SectionTitle>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{attempt.transcript.text}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={onRetry}>Retry this task again</Button>
        <Button size="lg" variant="secondary" onClick={onBack}>Back to attempt {after.attemptNumber} feedback</Button>
      </div>
    </div>
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

function IssueList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

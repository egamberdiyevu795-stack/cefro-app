import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { meetsTargetLevel, type TargetLevel } from "@/domain/cefr";
import type { AttemptView } from "@/domain/speaking/attempt";
import { formatDateTime } from "../lib/format";
import { CriteriaScores } from "./CriteriaScores";
import { IssueCard } from "./IssueCard";
import { RetryReviewCard } from "./RetryReviewCard";
import { TranscriptCard } from "./TranscriptCard";

export type EvaluatedAttempt = AttemptView & { evaluation: NonNullable<AttemptView["evaluation"]>; transcript: NonNullable<AttemptView["transcript"]> };

export function isEvaluated(attempt: AttemptView): attempt is EvaluatedAttempt {
  return attempt.status === "completed" && attempt.evaluation !== null && attempt.transcript !== null;
}

export function FeedbackReport({
  attempt,
  targetLevel,
  onRetry,
  onCompare,
  onBack,
}: {
  attempt: EvaluatedAttempt;
  targetLevel: TargetLevel;
  onRetry: () => void;
  onCompare: (() => void) | null;
  onBack: () => void;
}) {
  const { result, meta } = attempt.evaluation;
  const meetsTarget = meetsTargetLevel(result.overall_level, targetLevel);

  const actions = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button size="lg" onClick={onRetry}>Retry this task</Button>
      {onCompare && (
        <Button size="lg" variant="secondary" onClick={onCompare}>
          Compare with attempt {attempt.attemptNumber - 1}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {meta.isDevelopmentProvider && (
        <Alert tone="warning" title="Development evaluator">
          This feedback was produced by the local development evaluator, not a real AI assessment. Configure an evaluation provider to get real feedback.
        </Alert>
      )}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-subtle">Attempt {attempt.attemptNumber} · estimated level</p>
            <p className="mt-1 text-5xl font-semibold tracking-tight">{result.overall_level}</p>
          </div>
          <Badge tone={meetsTarget ? "success" : "warning"} className="text-sm">
            {meetsTarget ? `Meets the ${targetLevel} target` : `Below the ${targetLevel} target`}
          </Badge>
        </div>
        <p className="leading-relaxed">{result.overall_summary}</p>
        {result.reliability_note && (
          <p className="rounded-xl bg-warning-soft p-3 text-sm text-ink">
            <span className="font-semibold">Note: </span>
            {result.reliability_note}
          </p>
        )}
        {actions}
      </Card>

      {result.retry_review && <RetryReviewCard review={result.retry_review} />}

      <section className="space-y-4" aria-labelledby="improve-heading">
        <div>
          <h2 id="improve-heading" className="text-xl font-semibold">What to improve</h2>
          <p className="mt-1 text-sm text-muted">Most important first. Each point uses your own words.</p>
        </div>
        {result.issues.map((issue, i) => (
          <IssueCard key={`${issue.criterion}-${i}`} issue={issue} index={i} />
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <CriteriaScores criteria={result.criteria} />
        <div className="space-y-6">
          <Card>
            <SectionTitle>What you did well</SectionTitle>
            <ul className="mt-3 space-y-4">
              {result.strengths.map((strength) => (
                <li key={strength.title}>
                  <p className="font-medium">✓ {strength.title}</p>
                  <p className="mt-1 text-sm text-muted">{strength.detail}</p>
                  {strength.evidence_quote && (
                    <blockquote className="mt-2 border-l-2 border-success/60 pl-3 text-sm italic text-muted">
                      &ldquo;{strength.evidence_quote}&rdquo;
                    </blockquote>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <TranscriptCard attemptId={attempt.id} text={attempt.transcript.text} metrics={attempt.metrics} />
        </div>
      </div>

      <Card className="space-y-4 border-brand/30 bg-brand-soft/40">
        <div>
          <SectionTitle>Your focus for the next attempt</SectionTitle>
          <ul className="mt-3 space-y-2">
            {result.retry_focus.map((focus) => (
              <li key={focus.objective}>
                <p className="font-medium">→ {focus.objective}</p>
                <p className="text-sm text-muted">{focus.success_check}</p>
              </li>
            ))}
          </ul>
        </div>
        {actions}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-subtle">
        <Button variant="ghost" onClick={onBack}>← Back to task</Button>
        <p>
          Evaluated {formatDateTime(meta.createdAt)} · {meta.evaluatorVersion} · {meta.rubricVersion} · {meta.model}
        </p>
      </div>
    </div>
  );
}

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { meetsTargetLevel } from "@/domain/cefr";
import type { AttemptView } from "@/domain/speaking/attempt";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { formatDateTime } from "../lib/format";
import { CriteriaScores } from "./CriteriaScores";
import { IssueCard } from "./IssueCard";
import { RetryReviewCard } from "./RetryReviewCard";
import { TaskCoverageCard } from "./TaskCoverageCard";
import { TranscriptCard } from "./TranscriptCard";

export type EvaluatedAttempt = AttemptView & {
  evaluation: NonNullable<AttemptView["evaluation"]>;
  transcript: NonNullable<AttemptView["transcript"]>;
};

export function isEvaluated(attempt: AttemptView): attempt is EvaluatedAttempt {
  return attempt.status === "completed" && attempt.evaluation !== null && attempt.transcript !== null;
}

/**
 * Feedback for one attempt, ordered to answer the student's questions in turn:
 * How did I do? → What went well? → What is the biggest thing to fix (with
 * evidence, fix and better version)? → What do I focus on? → Retry.
 * Everything else (other issues, scores, transcript) comes after the CTA.
 */
export function FeedbackReport({
  attempt,
  task,
  onRetry,
  onCompare,
  onBack,
}: {
  attempt: EvaluatedAttempt;
  task: PublicSpeakingTask;
  onRetry: () => void;
  onCompare: (() => void) | null;
  onBack: () => void;
}) {
  const { result, meta } = attempt.evaluation;
  const meetsTarget = meetsTargetLevel(result.overall_level, task.level);
  const [topIssue, ...otherIssues] = result.issues;

  return (
    <div className="space-y-6">
      {meta.isDevelopmentProvider && (
        <Alert tone="warning" title="Development evaluator">
          This feedback was produced by the local development evaluator, not a real AI assessment. Configure an evaluation provider to get real feedback.
        </Alert>
      )}

      {/* 1. How did I do? */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-subtle">Attempt {attempt.attemptNumber} · estimated level</p>
            <p className="mt-1 text-5xl font-semibold tracking-tight">{result.overall_level}</p>
          </div>
          <Badge tone={meetsTarget ? "success" : "warning"} className="text-sm">
            {meetsTarget ? `Meets the ${task.level} target` : `Below the ${task.level} target`}
          </Badge>
        </div>
        <p className="leading-relaxed">{result.overall_summary}</p>
        {result.reliability_note && (
          <p className="rounded-xl bg-warning-soft p-3 text-sm">
            <span className="font-semibold">Note: </span>
            {result.reliability_note}
          </p>
        )}
        {onCompare && (
          <Button variant="secondary" onClick={onCompare}>
            Compare with attempt {attempt.attemptNumber - 1}
          </Button>
        )}
      </Card>

      {result.retry_review && <RetryReviewCard review={result.retry_review} />}

      {/* 2. What went well */}
      <Card>
        <SectionTitle>What you did well</SectionTitle>
        <ul className="mt-3 grid gap-4 sm:grid-cols-2">
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

      {/* 3–5. The biggest thing to fix, with evidence, fix and a better version */}
      <section className="space-y-3" aria-labelledby="top-fix-heading">
        <h2 id="top-fix-heading" className="text-xl font-semibold">The biggest thing to fix</h2>
        <IssueCard issue={topIssue} highlight />
      </section>

      {/* 6–7. Focus and retry */}
      <Card className="space-y-4 border-brand/40 bg-brand-soft/50">
        <div>
          <SectionTitle>Your focus for the next attempt</SectionTitle>
          <ul className="mt-3 space-y-3">
            {result.retry_focus.map((focus) => (
              <li key={focus.objective}>
                <p className="font-medium">→ {focus.objective}</p>
                <p className="text-sm text-muted">How to check: {focus.success_check}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={onRetry}>Retry this task</Button>
        </div>
      </Card>

      {otherIssues.length > 0 && (
        <section className="space-y-3" aria-labelledby="other-issues-heading">
          <div>
            <h2 id="other-issues-heading" className="text-lg font-semibold">Also worth working on</h2>
            <p className="text-sm text-muted">Fix the point above first. Open these when you are ready.</p>
          </div>
          {otherIssues.map((issue, i) => (
            <IssueCard key={`${issue.criterion}-${i}`} issue={issue} collapsible />
          ))}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {result.task_coverage.length > 0 && <TaskCoverageCard task={task} coverage={result.task_coverage} />}
          <CriteriaScores criteria={result.criteria} />
        </div>
        <TranscriptCard attemptId={attempt.id} text={attempt.transcript.text} metrics={attempt.metrics} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-subtle">
        <Button variant="ghost" onClick={onBack}>← Back to task</Button>
        <p>
          Evaluated {formatDateTime(meta.createdAt)} · {meta.evaluatorVersion} · {meta.rubricVersion} · {meta.model}
        </p>
      </div>
    </div>
  );
}

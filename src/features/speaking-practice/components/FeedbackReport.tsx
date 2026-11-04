import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { FEATURE_LABELS } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { LegacyEvaluation } from "@/domain/evaluation/stored";
import type { AttemptView } from "@/domain/speaking/attempt";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { formatDateTime } from "../lib/format";
import { BiggestFixCard } from "./BiggestFixCard";
import { FeatureLevels } from "./FeatureLevels";
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

interface ReportProps {
  attempt: EvaluatedAttempt;
  task: PublicSpeakingTask;
  onRetry: () => void;
  onCompare: (() => void) | null;
  onBack: () => void;
}

/**
 * Feedback for one attempt, ordered to answer the student's questions in turn:
 * What band did I get for this part? → What went well? → What is the biggest thing to fix? → What do I focus on? → Retry.
 * Everything else (questions, features, transcript) comes after the CTA.
 *
 * Only the PART band is shown. An overall exam level, or a 0–75 exam score, is never derived from one part.
 */
export function FeedbackReport(props: ReportProps) {
  const { result } = props.attempt.evaluation;
  return result.kind === "multilevel" ? <MultilevelReport {...props} result={result} /> : <LegacyReport {...props} result={result} />;
}

function MultilevelReport({ attempt, task, onRetry, onCompare, onBack, result }: ReportProps & { result: MultilevelResult }) {
  const { meta } = attempt.evaluation;
  const { scoring, assessment } = result;

  return (
    <div className="space-y-6">
      {meta.isDevelopmentProvider && (
        <Alert tone="warning" title="Development evaluator">
          This feedback was produced by the local development evaluator, not a real AI assessment. Configure an evaluation provider to get real feedback.
        </Alert>
      )}

      {/* 1. How did I do on this part? */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-subtle">Attempt {attempt.attemptNumber}</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl" data-testid="band-headline">
              Part {result.part}: {scoring.band}/{scoring.band_max} · {scoring.label}
            </h2>
          </div>
          <Badge tone={scoring.meets_target ? "success" : "warning"} className="text-sm">
            {scoring.meets_target ? `Meets ${task.level} target` : `Below ${task.level} target (need ${scoring.target_band}+)`}
          </Badge>
        </div>
        <p className="text-sm text-muted">
          You answered {scoring.on_topic_count} of {assessment.questions.length} questions on topic. This is the band for Part {result.part} only, not
          an overall exam result.
        </p>
        {scoring.zero_reason && <p className="rounded-xl bg-warning-soft p-3 text-sm">{ZERO_REASON[scoring.zero_reason]}</p>}
        {scoring.provisional && (
          <p className="rounded-xl bg-surface-muted p-3 text-sm" data-testid="provisional-note">
            <span className="font-semibold">Provisional: pronunciation not assessed.</span> Your band could change once pronunciation is included.
          </p>
        )}
        {onCompare && (
          <Button variant="secondary" onClick={onCompare}>
            Compare with attempt {attempt.attemptNumber - 1}
          </Button>
        )}
      </Card>

      {assessment.retry_review && <RetryReviewCard review={assessment.retry_review} />}

      {/* 2. What went well (only real evidence at B2 or above; none is invented) */}
      {assessment.strengths.length > 0 && (
        <Card>
          <SectionTitle>What you did well</SectionTitle>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {assessment.strengths.map((strength) => (
              <li key={strength.quote}>
                <p className="font-medium">✓ {FEATURE_LABELS[strength.feature]}</p>
                <p className="mt-1 text-sm text-muted">{strength.note}</p>
                <blockquote className="mt-2 border-l-2 border-success/60 pl-3 text-sm italic text-muted">&ldquo;{strength.quote}&rdquo;</blockquote>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 3. The biggest thing to fix */}
      <section className="space-y-3" aria-labelledby="top-fix-heading">
        <h2 id="top-fix-heading" className="text-xl font-semibold">The biggest thing to fix</h2>
        <BiggestFixCard result={result} task={task} />
      </section>

      {/* 4. Focus and retry */}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <TaskCoverageCard task={task} questions={assessment.questions} />
          <FeatureLevels result={result} metrics={attempt.metrics} />
        </div>
        <TranscriptCard attemptId={attempt.id} text={attempt.transcript.text} metrics={attempt.metrics} durationMs={attempt.recordingDurationMs} />
      </div>

      <Footer attempt={attempt} onBack={onBack} />
    </div>
  );
}

const ZERO_REASON = {
  too_short: "Band 0: the answer is too short to rate (under 30 words). Answer every question with a reason or an example.",
  memorized_or_irrelevant: "Band 0: the answer looks memorised or does not answer these questions.",
  no_question_on_topic: "Band 0: none of the questions was answered on topic.",
  below_B1: "Band 0: the language is below B1 level for this part.",
} as const;

/** Attempts scored before the band scale (schema 1–2): shown as they were, without any level or band. */
function LegacyReport({ attempt, onRetry, onBack, result }: ReportProps & { result: LegacyEvaluation }) {
  const [topIssue] = result.issues;
  return (
    <div className="space-y-6">
      <Alert tone="warning" title="Scored with an older method">
        This attempt was assessed before CEFRO switched to the official Multilevel band scale, so it has no Part 2 band. Retry the task to get one.
      </Alert>
      {topIssue && (
        <section className="space-y-3" aria-labelledby="top-fix-heading">
          <h2 id="top-fix-heading" className="text-xl font-semibold">The biggest thing to fix</h2>
          <IssueCard issue={topIssue} highlight />
        </section>
      )}
      <Card className="space-y-4 border-brand/40 bg-brand-soft/50">
        <SectionTitle>Your focus for the next attempt</SectionTitle>
        <ul className="space-y-3">
          {result.retry_focus.map((focus) => (
            <li key={focus.objective}>
              <p className="font-medium">→ {focus.objective}</p>
              <p className="text-sm text-muted">How to check: {focus.success_check}</p>
            </li>
          ))}
        </ul>
        <Button size="lg" onClick={onRetry}>Retry this task</Button>
      </Card>
      <TranscriptCard attemptId={attempt.id} text={attempt.transcript.text} metrics={attempt.metrics} durationMs={attempt.recordingDurationMs} />
      <Footer attempt={attempt} onBack={onBack} />
    </div>
  );
}

function Footer({ attempt, onBack }: { attempt: EvaluatedAttempt; onBack: () => void }) {
  const { meta } = attempt.evaluation;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-subtle">
      <Button variant="ghost" onClick={onBack}>← Back to task</Button>
      <p>
        Evaluated {formatDateTime(meta.createdAt)} · {meta.evaluatorVersion} · {meta.rubricVersion} · {meta.model}
      </p>
    </div>
  );
}

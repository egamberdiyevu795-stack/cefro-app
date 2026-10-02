import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { CRITERION_LABELS } from "@/domain/evaluation/criteria";
import type { EvaluationIssue } from "@/domain/evaluation/schema";

const SEVERITY = {
  high: { label: "High impact", tone: "danger" },
  medium: { label: "Medium impact", tone: "warning" },
  low: { label: "Low impact", tone: "neutral" },
} as const;

const EVIDENCE_LABEL: Record<EvaluationIssue["evidence_basis"], string> = {
  transcript_quote: "What you said",
  speech_metric: "From your speech data",
  task_requirement: "Missing from the task",
};

/**
 * One weakness explained as: problem → evidence → why it matters → what to do
 * → better version. `collapsible` shows only the problem until opened.
 */
export function IssueCard({
  issue,
  highlight = false,
  collapsible = false,
}: {
  issue: EvaluationIssue;
  highlight?: boolean;
  collapsible?: boolean;
}) {
  const severity = SEVERITY[issue.severity];
  const header = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={severity.tone}>{severity.label}</Badge>
        <Badge>{CRITERION_LABELS[issue.criterion]}</Badge>
      </div>
      <h3 className={cn("font-semibold leading-snug", highlight ? "text-xl" : "text-base")}>{issue.problem}</h3>
    </>
  );

  const body = (
    <div className="space-y-4">
      {issue.evidence_quotes.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{EVIDENCE_LABEL[issue.evidence_basis]}</p>
          <div className="mt-1 space-y-1">
            {issue.evidence_quotes.map((quote) => (
              <blockquote key={quote} className="border-l-2 border-warning/60 pl-3 text-sm italic text-muted">
                &ldquo;{quote}&rdquo;
              </blockquote>
            ))}
          </div>
        </div>
      )}

      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-subtle">Why it matters</dt>
          <dd className="mt-1 text-sm leading-relaxed">{issue.why_it_matters}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-subtle">How to fix it</dt>
          <dd className="mt-1 text-sm leading-relaxed">{issue.how_to_fix}</dd>
        </div>
      </dl>

      <div className="rounded-xl bg-surface-muted p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Better version</p>
        {issue.improved_example.original && (
          <p className="mt-2 text-muted">
            <span className="sr-only">You said: </span>
            <span className="line-through decoration-danger/50">{issue.improved_example.original}</span>
          </p>
        )}
        <p className="mt-1 font-medium text-success">
          <span className="sr-only">Better: </span>
          {issue.improved_example.improved}
        </p>
      </div>
    </div>
  );

  if (collapsible) {
    return (
      // Not <Card>: its padding would double up with the clickable summary's padding.
      <div className="rounded-2xl border border-border bg-surface">
        <details className="group">
          <summary className="cursor-pointer list-none space-y-2 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
            {header}
            <span className="text-sm font-medium text-brand group-open:hidden">Show how to fix it ↓</span>
          </summary>
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">{body}</div>
        </details>
      </div>
    );
  }

  return (
    <Card className={cn("space-y-4", highlight && "border-2 border-warning/40")}>
      <div className="space-y-2">{header}</div>
      {body}
    </Card>
  );
}

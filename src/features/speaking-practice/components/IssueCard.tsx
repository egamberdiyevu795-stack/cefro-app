import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CRITERION_LABELS } from "@/domain/evaluation/criteria";
import type { EvaluationIssue } from "@/domain/evaluation/schema";

const SEVERITY = {
  high: { label: "High impact", tone: "danger" },
  medium: { label: "Medium impact", tone: "warning" },
  low: { label: "Low impact", tone: "neutral" },
} as const;

/** One weakness explained as: problem → why it matters → what to do → better example. */
export function IssueCard({ issue, index }: { issue: EvaluationIssue; index: number }) {
  const severity = SEVERITY[issue.severity];
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-subtle">#{index + 1}</span>
        <Badge tone={severity.tone}>{severity.label}</Badge>
        <Badge>{CRITERION_LABELS[issue.criterion]}</Badge>
      </div>
      <h3 className="text-lg font-semibold leading-snug">{issue.problem}</h3>

      {issue.evidence_quotes.length > 0 && (
        <div className="space-y-1">
          {issue.evidence_quotes.map((quote) => (
            <blockquote key={quote} className="border-l-2 border-warning/60 pl-3 text-sm italic text-muted">
              &ldquo;{quote}&rdquo;
            </blockquote>
          ))}
        </div>
      )}

      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-subtle">Why it matters</dt>
          <dd className="mt-1 text-sm leading-relaxed">{issue.why_it_matters}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-subtle">What to do</dt>
          <dd className="mt-1 text-sm leading-relaxed">{issue.how_to_fix}</dd>
        </div>
      </dl>

      <div className="rounded-xl bg-surface-muted p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Better version</p>
        {issue.improved_example.original && (
          <p className="mt-2 text-muted line-through decoration-danger/50">{issue.improved_example.original}</p>
        )}
        <p className="mt-1 font-medium text-success">{issue.improved_example.improved}</p>
      </div>
    </Card>
  );
}

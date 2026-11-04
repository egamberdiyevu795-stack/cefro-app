import { Badge } from "@/components/ui/Badge";
import { Card, SectionTitle } from "@/components/ui/Card";
import type { RetryReview } from "@/domain/evaluation/multilevel/model-output";

const OUTCOME = {
  achieved: { label: "Achieved", tone: "success" },
  partly_achieved: { label: "Partly", tone: "warning" },
  not_achieved: { label: "Not yet", tone: "danger" },
} as const;

/** How the student did on the focus they were given before this retry. */
export function RetryReviewCard({ review }: { review: RetryReview }) {
  return (
    <Card className="space-y-4 border-brand/30">
      <SectionTitle>Your focus this time</SectionTitle>
      <ul className="space-y-3">
        {review.objectives.map((item) => {
          const outcome = OUTCOME[item.outcome];
          return (
            <li key={item.objective} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={outcome.tone}>{outcome.label}</Badge>
                <span className="font-medium">{item.objective}</span>
              </div>
              <p className="text-sm text-muted">{item.evidence}</p>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border pt-3 text-sm leading-relaxed">{review.summary}</p>
    </Card>
  );
}

import { cn } from "@/components/ui/cn";
import { CRITERION_SCORE_MAX } from "@/domain/evaluation/criteria";

export function ScoreBar({ score, className }: { score: number | null; className?: string }) {
  const pct = score === null ? 0 : (score / CRITERION_SCORE_MAX) * 100;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-muted", className)} aria-hidden>
      <div
        className={cn("h-full rounded-full", score === null ? "" : score >= 7 ? "bg-success" : score >= 5 ? "bg-brand" : "bg-warning")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

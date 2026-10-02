import { Card, SectionTitle } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import type { TaskCoverageItem } from "@/domain/evaluation/schema";
import type { PublicSpeakingTask } from "@/domain/speaking/task";

const STATUS = {
  covered: { icon: "✓", label: "Covered", className: "bg-success-soft text-success" },
  partly_covered: { icon: "◐", label: "Partly covered", className: "bg-warning-soft text-warning" },
  not_covered: { icon: "✗", label: "Not covered", className: "bg-danger-soft text-danger" },
} as const;

/** Which task points the answer addressed. */
export function TaskCoverageCard({ task, coverage }: { task: PublicSpeakingTask; coverage: TaskCoverageItem[] }) {
  return (
    <Card>
      <SectionTitle>Did you answer every point?</SectionTitle>
      <ul className="mt-3 space-y-3">
        {coverage.map((item) => {
          const status = STATUS[item.status];
          return (
            <li key={item.prompt_index} className="flex gap-3">
              <span
                className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", status.className)}
                aria-label={status.label}
                role="img"
              >
                {status.icon}
              </span>
              <div>
                <p className="text-sm font-medium">{task.prompts[item.prompt_index]}</p>
                <p className="text-sm text-muted">{item.note}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

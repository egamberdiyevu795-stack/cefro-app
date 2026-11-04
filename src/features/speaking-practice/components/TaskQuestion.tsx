import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import type { PublicSpeakingTask } from "@/domain/speaking/task";

/** The topic and the numbered questions. Reused in brief, preparation and recording. Numbering is 1-based everywhere. */
export function TaskQuestion({ task, compact = false }: { task: PublicSpeakingTask; compact?: boolean }) {
  return (
    <Card className={cn(compact && "p-4 sm:p-5")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Topic</p>
      <p className={cn("mt-2 font-medium leading-relaxed", compact ? "text-base" : "text-lg")}>{task.question}</p>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-subtle">Answer all {task.prompts.length} questions</p>
      <ol className="mt-2 space-y-2">
        {task.prompts.map((prompt, i) => (
          <li key={prompt} className="flex gap-3 leading-relaxed">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">
              {i + 1}
            </span>
            <span>
              <span className="sr-only">Question {i + 1}: </span>
              {prompt}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

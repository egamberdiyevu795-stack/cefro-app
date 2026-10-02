import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import type { PublicSpeakingTask } from "@/domain/speaking/task";

/** The question and talking points. Reused in brief, preparation and recording. */
export function TaskQuestion({ task, compact = false }: { task: PublicSpeakingTask; compact?: boolean }) {
  return (
    <Card className={cn(compact && "p-4 sm:p-5")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Question</p>
      <p className={cn("mt-2 font-medium leading-relaxed", compact ? "text-base" : "text-lg")}>{task.question}</p>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-subtle">Talk about</p>
      <ul className="mt-2 space-y-2">
        {task.prompts.map((prompt) => (
          <li key={prompt} className="flex gap-3 leading-relaxed">
            <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand" />
            <span>{prompt}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

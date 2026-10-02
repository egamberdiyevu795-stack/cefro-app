import { Badge } from "@/components/ui/Badge";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { formatDuration } from "../lib/format";

export function TaskHeader({ task }: { task: PublicSpeakingTask }) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">{task.level} level</Badge>
        <Badge>Speaking · Part {task.part}</Badge>
        <Badge>Prepare {formatDuration(task.preparationSeconds)}</Badge>
        <Badge>Speak {formatDuration(task.speakingSeconds)}</Badge>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{task.title}</h1>
    </header>
  );
}

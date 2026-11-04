import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { RetryFocusItem } from "@/domain/evaluation/stored";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { CountdownRing } from "./CountdownRing";
import { TaskQuestion } from "./TaskQuestion";

export function PreparationPanel({
  task,
  remainingMs,
  focus,
  onSkip,
}: {
  task: PublicSpeakingTask;
  remainingMs: number;
  focus: RetryFocusItem[] | null;
  onSkip: () => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <TaskQuestion task={task} />
        {focus && focus.length > 0 && (
          <Card className="border-brand/30 bg-brand-soft/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Your focus</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {focus.map((item) => (
                <li key={item.objective}>{item.objective}</li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <Card className="flex flex-col items-center gap-5 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">Preparation</p>
        <CountdownRing remainingMs={remainingMs} totalMs={task.preparationSeconds * 1000} label="to prepare" />
        <p className="text-sm text-muted">
          Plan a short answer, with a reason, for each of the {task.prompts.length} questions. Recording starts automatically when the time is up.
        </p>
        <Button variant="secondary" className="w-full" onClick={onSkip}>
          I&apos;m ready — start speaking
        </Button>
      </Card>
    </div>
  );
}

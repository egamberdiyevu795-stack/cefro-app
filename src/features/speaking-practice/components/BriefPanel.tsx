import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { TaskQuestion } from "./TaskQuestion";

export function BriefPanel({
  task,
  onStart,
  isRequestingMicrophone,
  history,
}: {
  task: PublicSpeakingTask;
  onStart: () => void;
  isRequestingMicrophone: boolean;
  history: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <TaskQuestion task={task} />
        <Card>
          <SectionTitle>How it works</SectionTitle>
          <ol className="mt-3 space-y-2 text-sm text-muted">
            {task.instructions.map((line, i) => (
              <li key={line} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-ink">
                  {i + 1}
                </span>
                <span className="pt-0.5">{line}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <aside className="space-y-4">
        <Card className="space-y-4">
          <div>
            <SectionTitle>Ready?</SectionTitle>
            <p className="mt-1 text-sm text-muted">
              We&apos;ll ask for microphone access, then your preparation time starts. Recording begins automatically when it ends.
            </p>
          </div>
          <Button size="lg" className="w-full" onClick={onStart} disabled={isRequestingMicrophone}>
            {isRequestingMicrophone ? "Waiting for microphone…" : "Start preparation"}
          </Button>
          <p className="text-xs text-subtle">Find a quiet place and use headphones with a microphone if you can.</p>
        </Card>
        {history}
      </aside>
    </div>
  );
}

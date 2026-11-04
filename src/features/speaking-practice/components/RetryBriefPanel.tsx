import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import type { AttemptView } from "@/domain/speaking/attempt";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { TaskQuestion } from "./TaskQuestion";

/** Shown before a retry: what to focus on this time. */
export function RetryBriefPanel({
  task,
  previous,
  onStart,
  onCancel,
  isRequestingMicrophone,
}: {
  task: PublicSpeakingTask;
  previous: AttemptView;
  onStart: () => void;
  onCancel: () => void;
  isRequestingMicrophone: boolean;
}) {
  const focus = previous.evaluation?.result.retry_focus ?? [];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card className="border-brand/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Attempt {previous.attemptNumber + 1}</p>
          <h2 className="mt-1 text-xl font-semibold">Your focus</h2>
          <p className="mt-1 text-sm text-muted">Keep these in mind while you prepare and speak.</p>
          <ol className="mt-5 space-y-4">
            {focus.map((item, i) => (
              <li key={item.objective} className="flex gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium">{item.objective}</p>
                  <p className="mt-0.5 text-sm text-muted">✓ {item.success_check}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
        {/* In the main column, not the narrow aside, so the picture fits beside the questions on desktop. */}
        <TaskQuestion task={task} compact />
      </div>
      <aside className="space-y-4">
        <Card className="space-y-3">
          <SectionTitle>Same task, same timing</SectionTitle>
          <Button size="lg" className="w-full" onClick={onStart} disabled={isRequestingMicrophone}>
            {isRequestingMicrophone ? "Waiting for microphone…" : "Start preparation"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onCancel}>
            Back to task
          </Button>
        </Card>
      </aside>
    </div>
  );
}

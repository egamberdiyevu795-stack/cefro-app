import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { formatClock } from "../lib/format";
import { CountdownRing } from "./CountdownRing";
import { LevelMeter } from "./LevelMeter";
import { TaskQuestion } from "./TaskQuestion";

export function RecordingPanel({
  task,
  remainingMs,
  level,
  onFinish,
}: {
  task: PublicSpeakingTask;
  remainingMs: number;
  level: number;
  onFinish: () => void;
}) {
  const totalMs = task.speakingSeconds * 1000;
  const elapsedMs = totalMs - remainingMs;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <TaskQuestion task={task} />
      <Card className="flex flex-col items-center gap-5 border-record/30 text-center">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-record">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-record opacity-60" />
            <span className="relative inline-flex size-3 rounded-full bg-record" />
          </span>
          Recording
        </p>
        <CountdownRing remainingMs={remainingMs} totalMs={totalMs} label="remaining" tone="record" />
        <LevelMeter level={level} />
        <p className="text-sm text-muted" aria-live="polite">
          You have spoken for {formatClock(elapsedMs)}. Try to keep going until the time is nearly up.
        </p>
        <Button variant="danger" size="lg" className="w-full" onClick={onFinish}>
          Finish answer
        </Button>
      </Card>
    </div>
  );
}

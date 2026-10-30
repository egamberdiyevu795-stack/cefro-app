import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/components/ui/cn";
import type { AttemptStatus } from "@/domain/speaking/attempt";

const STEPS: { label: string; activeDuring: AttemptStatus[] }[] = [
  { label: "Uploading your recording", activeDuring: [] },
  { label: "Transcribing your answer", activeDuring: ["uploaded", "processing", "transcribing"] },
  { label: "Evaluating against the B2 rubric", activeDuring: ["evaluating"] },
];

/** Progress through upload → transcription → evaluation, driven by server status. */
export function ProcessingPanel({
  status,
  isUploading,
  isSlow,
  connectionError,
}: {
  status: AttemptStatus | null;
  isUploading: boolean;
  isSlow: boolean;
  connectionError: string | null;
}) {
  const activeIndex = isUploading ? 0 : STEPS.findIndex((step) => status && step.activeDuring.includes(status));
  const current = activeIndex === -1 ? 1 : activeIndex;
  return (
    <Card className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Preparing your feedback</h2>
        <p className="mt-1 text-sm text-muted">This usually takes under a minute. You can keep this tab open.</p>
      </div>
      <ol className="space-y-3" aria-live="polite">
        {STEPS.map((step, i) => {
          const state = i < current ? "done" : i === current ? "active" : "pending";
          return (
            <li key={step.label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-sm",
                  state === "done" && "bg-success-soft text-success",
                  state === "active" && "bg-brand-soft text-brand",
                  state === "pending" && "bg-surface-muted text-subtle",
                )}
              >
                {state === "done" ? "✓" : state === "active" ? <Spinner className="size-4" /> : i + 1}
              </span>
              <span className={cn(state === "pending" ? "text-subtle" : "text-ink", state === "active" && "font-medium")}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      {isSlow && !connectionError && (
        <Alert tone="info" title="Still working on it">
          This is taking longer than usual. Your recording is saved, so nothing will be lost.
        </Alert>
      )}
      {connectionError && (
        <Alert tone="warning" title="Reconnecting…">
          {connectionError} Your recording is saved on our side, so nothing is lost. We&apos;ll keep checking automatically and
          continue as soon as the connection is back.
        </Alert>
      )}
    </Card>
  );
}

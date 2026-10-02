import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import type { AttemptView } from "@/domain/speaking/attempt";
import { describeFailure } from "../lib/failure-messages";

/** A processed attempt that failed or stalled. The recording is kept on the server. */
export function FailurePanel({
  attempt,
  isRestarting,
  restartError,
  onRestart,
  onReRecord,
}: {
  attempt: AttemptView;
  isRestarting: boolean;
  restartError: string | null;
  onRestart: () => void;
  onReRecord: () => void;
}) {
  const copy = attempt.isStalled
    ? describeFailure({ stage: null, code: "processing_stalled" })
    : describeFailure(attempt.failure);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Alert
        tone="danger"
        title={copy.title}
        actions={
          <>
            {copy.canRetryProcessing && (
              <Button onClick={onRestart} disabled={isRestarting}>
                {isRestarting ? "Trying again…" : "Try again"}
              </Button>
            )}
            <Button variant={copy.suggestReRecord ? "primary" : "secondary"} onClick={onReRecord}>
              Record a new answer
            </Button>
          </>
        }
      >
        {copy.message}
      </Alert>
      {restartError && <Alert tone="warning" title="That didn't work">{restartError}</Alert>}
    </div>
  );
}

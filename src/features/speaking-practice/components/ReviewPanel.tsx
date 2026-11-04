import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Recording } from "../hooks/useAudioRecorder";
import { formatDuration } from "../lib/format";
import { RecordingPlayer } from "./RecordingPlayer";

/** Listen back before submitting; submit or record again. */
export function ReviewPanel({
  recording,
  speakingSeconds,
  onSubmit,
  onReRecord,
}: {
  recording: Recording;
  speakingSeconds: number;
  onSubmit: () => void;
  onReRecord: () => void;
}) {
  const seconds = Math.round(recording.durationMs / 1000);
  const isShort = seconds < speakingSeconds * 0.4;
  return (
    <Card className="mx-auto max-w-xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Listen to your answer</h2>
        <p className="mt-1 text-sm text-muted">You spoke for {formatDuration(seconds)}. Submit it for feedback, or record again.</p>
      </div>
      <RecordingPlayer src={recording.url} durationMs={recording.durationMs} label="Your recorded answer" />
      {isShort && (
        <Alert tone="warning" title="Your answer is quite short">
          At B2, examiners expect you to use most of the {formatDuration(speakingSeconds)}. You can still submit it.
        </Alert>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="flex-1" onClick={onSubmit}>
          Submit for feedback
        </Button>
        <Button size="lg" variant="secondary" onClick={onReRecord}>
          Record again
        </Button>
      </div>
    </Card>
  );
}

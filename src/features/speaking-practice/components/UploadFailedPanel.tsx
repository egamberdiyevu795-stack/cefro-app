import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import type { Recording } from "../hooks/useAudioRecorder";

/** The recording stays in the browser; the student can retry or download it. */
export function UploadFailedPanel({
  message,
  recording,
  onRetry,
  onReRecord,
}: {
  message: string;
  recording: Recording | null;
  onRetry: () => void;
  onReRecord: () => void;
}) {
  const extension = recording?.mimeType.includes("mp4") ? "m4a" : recording?.mimeType.includes("ogg") ? "ogg" : "webm";
  return (
    <div className="mx-auto max-w-xl">
      <Alert
        tone="danger"
        title="Your recording wasn't sent"
        actions={
          <>
            <Button onClick={onRetry} disabled={!recording}>Try sending again</Button>
            {recording && (
              <a
                href={recording.url}
                download={`cefro-answer.${extension}`}
                className="inline-flex h-10 items-center rounded-xl border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted"
              >
                Download a copy
              </a>
            )}
            <Button variant="ghost" onClick={onReRecord}>Record again</Button>
          </>
        }
      >
        {message} Your answer is still saved in this browser tab — don&apos;t close it until it&apos;s sent.
      </Alert>
    </div>
  );
}

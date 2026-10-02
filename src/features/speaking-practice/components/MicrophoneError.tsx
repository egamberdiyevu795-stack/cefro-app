import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import type { RecorderErrorKind } from "../hooks/useAudioRecorder";

const COPY: Record<RecorderErrorKind, { title: string; body: string }> = {
  permission_denied: {
    title: "Microphone access is blocked",
    body: "CEFRO needs your microphone to record your answer. Click the microphone or lock icon in your browser's address bar, allow microphone access, then try again.",
  },
  no_microphone: {
    title: "No microphone found",
    body: "Connect a microphone or headset, then try again.",
  },
  unsupported: {
    title: "Recording isn't supported in this browser",
    body: "Please open CEFRO in a recent version of Chrome, Edge, Firefox or Safari.",
  },
  recorder_failed: {
    title: "Recording stopped unexpectedly",
    body: "Something went wrong with the microphone. Check your microphone and try again.",
  },
};

export function MicrophoneError({ kind, onRetry }: { kind: RecorderErrorKind; onRetry: () => void }) {
  const copy = COPY[kind];
  return (
    <Alert
      tone="danger"
      title={copy.title}
      actions={kind !== "unsupported" && <Button onClick={onRetry}>Try again</Button>}
    >
      {copy.body}
    </Alert>
  );
}

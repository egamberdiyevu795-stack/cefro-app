import { Card, SectionTitle } from "@/components/ui/Card";
import type { SpeechMetrics } from "@/domain/speaking/metrics";
import { attemptAudioUrl } from "../lib/api-client";
import { formatDuration } from "../lib/format";

export function TranscriptCard({
  attemptId,
  text,
  metrics,
}: {
  attemptId: string;
  text: string;
  metrics: SpeechMetrics | null;
}) {
  return (
    <Card className="space-y-4">
      <div>
        <SectionTitle>Your answer</SectionTitle>
        <p className="mt-1 text-xs text-subtle">Automatic transcript — it may contain small recognition errors.</p>
      </div>
      <audio controls preload="none" src={attemptAudioUrl(attemptId)} className="w-full" />
      <p className="whitespace-pre-line leading-relaxed">{text}</p>
      {metrics && (
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-4">
          <Metric label="Speaking time" value={formatDuration(metrics.speakingSeconds)} />
          <Metric label="Words" value={String(metrics.wordCount)} />
          <Metric label="Words / min" value={metrics.wordsPerMinute === null ? "—" : String(metrics.wordsPerMinute)} />
          <Metric label="Hesitations" value={String(metrics.fillerCount)} />
        </dl>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

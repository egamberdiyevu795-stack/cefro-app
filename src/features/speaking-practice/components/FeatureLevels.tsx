import { Badge } from "@/components/ui/Badge";
import { Card, SectionTitle } from "@/components/ui/Card";
import { FEATURES, FEATURE_LABELS, LEVEL_LABELS, levelValue, NOT_ASSESSED, type Feature, type PronunciationLevel } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { SpeechMetrics } from "@/domain/speaking/metrics";
import { formatDuration } from "../lib/format";

export function levelTone(level: PronunciationLevel): "success" | "warning" | "danger" | "neutral" {
  if (level === NOT_ASSESSED) return "neutral";
  const value = levelValue(level);
  return value >= 2 ? "success" : value === 1 ? "warning" : "danger";
}

export function levelText(level: PronunciationLevel): string {
  return level === NOT_ASSESSED ? "Not assessed" : LEVEL_LABELS[level];
}

/**
 * Each feature of the official scale, with the level it was judged at and the evidence for it. Replaces the old
 * /10 criterion bars: the band is computed from these levels, so this is what the student can act on.
 */
export function FeatureLevels({ result, metrics }: { result: MultilevelResult; metrics: SpeechMetrics | null }) {
  const { features, errors } = result.assessment;
  return (
    <Card>
      <SectionTitle>Your language, feature by feature</SectionTitle>
      <p className="mt-1 text-xs text-subtle">Judged against the official B2 and B1 descriptors. Your band comes from these levels and from how many questions you answered.</p>
      <ul className="mt-4 divide-y divide-border">
        {FEATURES.map((feature) => {
          const f = features[feature];
          const featureErrors = errors.filter((e) => e.type === feature);
          return (
            <li key={feature} className="space-y-2 py-3" data-testid={`feature-${feature}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{FEATURE_LABELS[feature]}</p>
                <Badge tone={levelTone(f.level)}>{levelText(f.level)}</Badge>
              </div>
              {f.level === NOT_ASSESSED ? (
                <p className="text-sm text-muted">{notAssessedText(feature, result)}</p>
              ) : (
                <>
                  {f.note && <p className="text-sm text-muted">{f.note}</p>}
                  {f.evidence.length > 0 && (
                    <div className="space-y-1">
                      {f.evidence.map((quote) => (
                        <blockquote key={quote} className="border-l-2 border-border pl-3 text-sm italic text-muted">
                          &ldquo;{quote}&rdquo;
                        </blockquote>
                      ))}
                    </div>
                  )}
                  {featureErrors.length > 0 && <ErrorList errors={featureErrors} />}
                </>
              )}
              {feature === "fluency" && metrics && (
                <dl className="grid grid-cols-3 gap-2 pt-1 text-xs">
                  <Stat label="Speaking time" value={formatDuration(metrics.speakingSeconds)} />
                  <Stat label="Words / min" value={metrics.wordsPerMinute === null ? "—" : String(metrics.wordsPerMinute)} />
                  <Stat label="Hesitations" value={String(metrics.fillerCount)} />
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function ErrorList({ errors }: { errors: { quote: string; correction: string }[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {errors.map((error) => (
        <li key={error.quote}>
          <span className="text-danger line-through decoration-danger/60">{error.quote}</span>
          <span aria-hidden className="mx-1.5 text-subtle">→</span>
          <span className="sr-only"> should be </span>
          <span className="font-medium text-success">{error.correction}</span>
        </li>
      ))}
    </ul>
  );
}

function notAssessedText(feature: Feature, result: MultilevelResult): string {
  if (feature !== "pronunciation") return "Not assessed.";
  switch (result.audio.reason) {
    case "unclear":
      return "Not assessed: the recording was too unclear to judge. Try a quieter place.";
    case "failed":
    case "no_audio":
      return "Not assessed this time: we could not analyse the recording.";
    default:
      return "Not assessed: pronunciation needs the audio, and only the transcript was assessed.";
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-subtle">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

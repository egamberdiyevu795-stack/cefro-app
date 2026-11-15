import { FEATURES, ladderOf, levelValue, NOT_ASSESSED, type Feature, type PronunciationLevel } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult, MultilevelRetryFocus } from "@/domain/evaluation/multilevel/result";
import type { SpeechMetrics } from "./metrics";

export type ChangeDirection = "improved" | "same" | "declined" | "not_comparable";
/**
 * How much a change means. Judgements vary a little between evaluations of similar answers, so a one-band (or
 * one-level) change is "slight" and is never presented as real progress on its own.
 */
export type ChangeMagnitude = "none" | "slight" | "clear";

export interface FeatureComparison {
  feature: Feature;
  before: PronunciationLevel;
  after: PronunciationLevel;
  direction: ChangeDirection;
}

export type ComparisonVerdict =
  | "clear_improvement"
  | "slight_improvement"
  | "about_the_same"
  | "mixed"
  | "slight_decline"
  | "clear_decline";

export interface AttemptComparison {
  verdict: ComparisonVerdict;
  band: { before: number; after: number; bandMax: number; beforeLabel: string; afterLabel: string; direction: ChangeDirection; magnitude: ChangeMagnitude };
  questions: { before: number; after: number; total: number };
  features: FeatureComparison[];
  metrics: {
    wordCount: { before: number; after: number };
    speakingSeconds: { before: number; after: number };
    fillerCount: { before: number; after: number };
  } | null;
  /** Outcome of the focus the student was given, as judged by the retry evaluation. */
  focus: { achieved: number; partlyAchieved: number; notAchieved: number; total: number } | null;
  /** What to practise next: the newer attempt's retry focus. */
  practiceNext: MultilevelRetryFocus[];
  /** True when the two attempts were scored with different methodology versions. */
  methodologyChanged: boolean;
}

export interface ComparableAttempt {
  evaluation: MultilevelResult;
  metrics: SpeechMetrics | null;
  /** Evaluator + rubric version that produced the evaluation. */
  methodology?: string;
}

/**
 * Compare two evaluated attempts. Purely derived from stored results — it never invents improvement: an equal band is
 * "same", a lower band is "declined", and a one-band difference is labelled as slight.
 */
export function compareAttempts(before: ComparableAttempt, after: ComparableAttempt): AttemptComparison {
  const a = before.evaluation;
  const b = after.evaluation;
  // A part's own features only (Part 1.1 has no cohesion); levels are compared on that part's ladder.
  const rated = FEATURES.filter((f) => a.assessment.features[f] && b.assessment.features[f]);
  const ladder = ladderOf(rated.flatMap((f) => [a.assessment.features[f]!.level, b.assessment.features[f]!.level]));
  const features = rated.map((feature): FeatureComparison => {
    const from = a.assessment.features[feature]!.level;
    const to = b.assessment.features[feature]!.level;
    if (from === NOT_ASSESSED || to === NOT_ASSESSED) return { feature, before: from, after: to, direction: "not_comparable" };
    return { feature, before: from, after: to, direction: directionOf(levelValue(to, ladder) - levelValue(from, ladder)) };
  });
  const delta = b.scoring.band - a.scoring.band;
  const band = {
    before: a.scoring.band,
    after: b.scoring.band,
    bandMax: b.scoring.band_max,
    beforeLabel: a.scoring.label,
    afterLabel: b.scoring.label,
    direction: directionOf(delta),
    magnitude: magnitudeOf(delta),
  };

  const review = b.assessment.retry_review;
  return {
    verdict: verdictOf(delta, features),
    band,
    questions: { before: a.scoring.on_topic_count, after: b.scoring.on_topic_count, total: b.assessment.questions.length },
    features,
    metrics:
      before.metrics && after.metrics
        ? {
            wordCount: { before: before.metrics.wordCount, after: after.metrics.wordCount },
            speakingSeconds: { before: before.metrics.speakingSeconds, after: after.metrics.speakingSeconds },
            fillerCount: { before: before.metrics.fillerCount, after: after.metrics.fillerCount },
          }
        : null,
    focus: review
      ? {
          achieved: review.objectives.filter((o) => o.outcome === "achieved").length,
          partlyAchieved: review.objectives.filter((o) => o.outcome === "partly_achieved").length,
          notAchieved: review.objectives.filter((o) => o.outcome === "not_achieved").length,
          total: review.objectives.length,
        }
      : null,
    practiceNext: b.retry_focus,
    methodologyChanged: before.methodology !== undefined && after.methodology !== undefined && before.methodology !== after.methodology,
  };
}

/** Two or more bands is clear; one band is slight; features moving both ways with an equal band is mixed. */
function verdictOf(bandDelta: number, features: FeatureComparison[]): ComparisonVerdict {
  const up = features.some((f) => f.direction === "improved");
  const down = features.some((f) => f.direction === "declined");
  if (bandDelta >= 2) return "clear_improvement";
  if (bandDelta <= -2) return "clear_decline";
  if (bandDelta === 1) return down ? "mixed" : "slight_improvement";
  if (bandDelta === -1) return up ? "mixed" : "slight_decline";
  return up && down ? "mixed" : "about_the_same";
}

function directionOf(delta: number): ChangeDirection {
  if (delta > 0) return "improved";
  if (delta < 0) return "declined";
  return "same";
}

function magnitudeOf(delta: number): ChangeMagnitude {
  const size = Math.abs(delta);
  return size === 0 ? "none" : size === 1 ? "slight" : "clear";
}

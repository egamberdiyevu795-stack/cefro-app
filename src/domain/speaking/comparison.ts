import { cefrRank, type CefrLevel } from "@/domain/cefr";
import { SPEAKING_CRITERIA, type SpeakingCriterion } from "@/domain/evaluation/criteria";
import type { EvaluationIssue, EvaluationResult, RetryFocusItem } from "@/domain/evaluation/schema";
import type { SpeechMetrics } from "./metrics";

export type ChangeDirection = "improved" | "same" | "declined" | "not_comparable";
/**
 * How much a change means. AI scores vary a little between evaluations of
 * similar answers, so a 1-point (or one sub-band) change is "slight" and is
 * never presented as real progress on its own.
 */
export type ChangeMagnitude = "none" | "slight" | "clear";

export interface CriterionComparison {
  criterion: SpeakingCriterion;
  before: number | null;
  after: number | null;
  delta: number | null;
  direction: ChangeDirection;
  magnitude: ChangeMagnitude;
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
  overall: { before: CefrLevel; after: CefrLevel; direction: ChangeDirection; magnitude: ChangeMagnitude };
  criteria: CriterionComparison[];
  metrics: {
    wordCount: { before: number; after: number };
    speakingSeconds: { before: number; after: number };
    fillerCount: { before: number; after: number };
  } | null;
  /** Outcome of the focus the student was given, as judged by the retry evaluation. */
  focus: { achieved: number; partlyAchieved: number; notAchieved: number; total: number } | null;
  /** Criteria that clearly improved. */
  clearlyImproved: SpeakingCriterion[];
  /** Weakness areas (by criterion) flagged before but not after. */
  resolvedCriteria: SpeakingCriterion[];
  /** Weaknesses still flagged in the newer attempt, most important first. */
  remainingIssues: EvaluationIssue[];
  /** What to practise next: the newer attempt's retry focus. */
  practiceNext: RetryFocusItem[];
  /** True when the two attempts were scored with different methodology versions. */
  methodologyChanged: boolean;
  tally: { improved: number; declined: number; same: number };
}

export interface ComparableAttempt {
  evaluation: EvaluationResult;
  metrics: SpeechMetrics | null;
  /** Evaluator + rubric version that produced the evaluation. */
  methodology?: string;
}

/**
 * Compare two evaluated attempts. Purely derived from stored results — it
 * never invents improvement: equal scores are "same", lower scores are
 * "declined", and small differences are labelled as slight.
 */
export function compareAttempts(before: ComparableAttempt, after: ComparableAttempt): AttemptComparison {
  const criteria = SPEAKING_CRITERIA.map((criterion): CriterionComparison => {
    const a = before.evaluation.criteria[criterion];
    const b = after.evaluation.criteria[criterion];
    const beforeScore = a.assessable ? a.score : null;
    const afterScore = b.assessable ? b.score : null;
    if (beforeScore === null || afterScore === null) {
      return { criterion, before: beforeScore, after: afterScore, delta: null, direction: "not_comparable", magnitude: "none" };
    }
    const delta = afterScore - beforeScore;
    return { criterion, before: beforeScore, after: afterScore, delta, direction: directionOf(delta), magnitude: magnitudeOf(delta) };
  });

  const levelDelta = cefrRank(after.evaluation.overall_level) - cefrRank(before.evaluation.overall_level);
  const overall = {
    before: before.evaluation.overall_level,
    after: after.evaluation.overall_level,
    direction: directionOf(levelDelta),
    magnitude: magnitudeOf(levelDelta),
  };

  const clearlyImproved = criteria.filter((c) => c.direction === "improved" && c.magnitude === "clear").map((c) => c.criterion);
  const clearlyDeclined = criteria.filter((c) => c.direction === "declined" && c.magnitude === "clear").map((c) => c.criterion);

  const beforeIssueCriteria = new Set(before.evaluation.issues.map((issue) => issue.criterion));
  const afterIssueCriteria = new Set(after.evaluation.issues.map((issue) => issue.criterion));

  const review = after.evaluation.retry_review;
  const focus = review
    ? {
        achieved: review.objectives.filter((o) => o.outcome === "achieved").length,
        partlyAchieved: review.objectives.filter((o) => o.outcome === "partly_achieved").length,
        notAchieved: review.objectives.filter((o) => o.outcome === "not_achieved").length,
        total: review.objectives.length,
      }
    : null;

  return {
    verdict: verdictOf(overall, clearlyImproved.length, clearlyDeclined.length),
    overall,
    criteria,
    metrics:
      before.metrics && after.metrics
        ? {
            wordCount: { before: before.metrics.wordCount, after: after.metrics.wordCount },
            speakingSeconds: { before: before.metrics.speakingSeconds, after: after.metrics.speakingSeconds },
            fillerCount: { before: before.metrics.fillerCount, after: after.metrics.fillerCount },
          }
        : null,
    focus,
    clearlyImproved,
    resolvedCriteria: [...beforeIssueCriteria].filter((c) => !afterIssueCriteria.has(c)),
    remainingIssues: after.evaluation.issues,
    practiceNext: after.evaluation.retry_focus,
    methodologyChanged:
      before.methodology !== undefined && after.methodology !== undefined && before.methodology !== after.methodology,
    tally: {
      improved: criteria.filter((c) => c.direction === "improved").length,
      declined: criteria.filter((c) => c.direction === "declined").length,
      same: criteria.filter((c) => c.direction === "same").length,
    },
  };
}

function verdictOf(
  overall: { direction: ChangeDirection; magnitude: ChangeMagnitude },
  clearImprovements: number,
  clearDeclines: number,
): ComparisonVerdict {
  const overallClear = overall.magnitude === "clear";
  if ((clearImprovements > 0 && clearDeclines > 0) || (overallClear && overall.direction === "improved" && clearDeclines > 0)) {
    return "mixed";
  }
  if ((overallClear && overall.direction === "declined" && clearImprovements > 0)) return "mixed";
  if (clearImprovements > 0 || (overallClear && overall.direction === "improved")) {
    return overall.direction === "declined" ? "mixed" : "clear_improvement";
  }
  if (clearDeclines > 0 || (overallClear && overall.direction === "declined")) {
    return overall.direction === "improved" ? "mixed" : "clear_decline";
  }
  if (overall.direction === "improved") return "slight_improvement";
  if (overall.direction === "declined") return "slight_decline";
  return "about_the_same";
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

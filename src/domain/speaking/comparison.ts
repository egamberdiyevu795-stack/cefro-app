import { compareCefrLevels, type CefrLevel } from "@/domain/cefr";
import { SPEAKING_CRITERIA, type SpeakingCriterion } from "@/domain/evaluation/criteria";
import type { EvaluationIssue, EvaluationResult } from "@/domain/evaluation/schema";
import type { SpeechMetrics } from "./metrics";

export type ChangeDirection = "improved" | "same" | "declined" | "not_comparable";

export interface CriterionComparison {
  criterion: SpeakingCriterion;
  before: number | null;
  after: number | null;
  delta: number | null;
  direction: ChangeDirection;
}

export interface AttemptComparison {
  overall: { before: CefrLevel; after: CefrLevel; direction: ChangeDirection };
  criteria: CriterionComparison[];
  metrics: {
    wordCount: { before: number; after: number };
    speakingSeconds: { before: number; after: number };
    fillerCount: { before: number; after: number };
  } | null;
  /** Weakness areas (by criterion) flagged before but not after. */
  resolvedCriteria: SpeakingCriterion[];
  /** Weaknesses still flagged in the newer attempt. */
  remainingIssues: EvaluationIssue[];
  /** Counts of improved / declined / unchanged assessable criteria. */
  tally: { improved: number; declined: number; same: number };
}

/**
 * Compare two evaluated attempts. Purely derived from stored results —
 * this function never invents improvement: equal scores are "same",
 * lower scores are "declined".
 */
export function compareAttempts(
  before: { evaluation: EvaluationResult; metrics: SpeechMetrics | null },
  after: { evaluation: EvaluationResult; metrics: SpeechMetrics | null },
): AttemptComparison {
  const criteria = SPEAKING_CRITERIA.map((criterion): CriterionComparison => {
    const a = before.evaluation.criteria[criterion];
    const b = after.evaluation.criteria[criterion];
    const beforeScore = a.assessable ? a.score : null;
    const afterScore = b.assessable ? b.score : null;
    if (beforeScore === null || afterScore === null) {
      return { criterion, before: beforeScore, after: afterScore, delta: null, direction: "not_comparable" };
    }
    const delta = afterScore - beforeScore;
    return { criterion, before: beforeScore, after: afterScore, delta, direction: directionOf(delta) };
  });

  const beforeIssueCriteria = new Set(before.evaluation.issues.map((issue) => issue.criterion));
  const afterIssueCriteria = new Set(after.evaluation.issues.map((issue) => issue.criterion));

  return {
    overall: {
      before: before.evaluation.overall_level,
      after: after.evaluation.overall_level,
      direction: directionOf(
        compareCefrLevels(after.evaluation.overall_level, before.evaluation.overall_level),
      ),
    },
    criteria,
    metrics:
      before.metrics && after.metrics
        ? {
            wordCount: { before: before.metrics.wordCount, after: after.metrics.wordCount },
            speakingSeconds: {
              before: before.metrics.speakingSeconds,
              after: after.metrics.speakingSeconds,
            },
            fillerCount: { before: before.metrics.fillerCount, after: after.metrics.fillerCount },
          }
        : null,
    resolvedCriteria: [...beforeIssueCriteria].filter((c) => !afterIssueCriteria.has(c)),
    remainingIssues: after.evaluation.issues,
    tally: {
      improved: criteria.filter((c) => c.direction === "improved").length,
      declined: criteria.filter((c) => c.direction === "declined").length,
      same: criteria.filter((c) => c.direction === "same").length,
    },
  };
}

function directionOf(delta: number): ChangeDirection {
  if (delta > 0) return "improved";
  if (delta < 0) return "declined";
  return "same";
}

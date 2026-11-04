import { cefrRank, type CefrLevel } from "@/domain/cefr";
import type { EvaluationResult } from "@/domain/evaluation/schema";

/**
 * 0–5 Part 2 band, derived deterministically from an evaluation result, for the
 * band anchor set (part2-band-anchors.ts).
 *
 * The evaluator itself reports CEFR levels per criterion and a status per task
 * point; the band is computed from those two judgements so a miss shows which
 * one went wrong:
 *
 *   language   = median CEFR level of the language features (grammar,
 *                vocabulary, fluency & coherence), mapped to its official band
 *   questions  = task points answered on topic (covered or partly_covered)
 *
 *   language below B1 or no question on topic → 0
 *   B1        : 1 question → 1, 2–3 questions → 2   (B1 caps at 2)
 *   B2        : 1 → 2, 2 → 3, 3 → 4
 *   above B2  : 3 → 5 (1 → 3 and 2 → 4 by the same +1 step; not anchored yet)
 *
 * Sub-bands follow CEFRO's convention that "-" means "approaching" (see
 * meetsTargetLevel): B1- is below B1, B2- is still B1, C1- is still B2.
 */

export type LanguageBand = "below_b1" | "b1" | "b2" | "above_b2";
export type PartTwoBand = 0 | 1 | 2 | 3 | 4 | 5;

export const LANGUAGE_FEATURES = ["grammar", "vocabulary", "fluency_coherence"] as const;
export type LanguageFeature = (typeof LANGUAGE_FEATURES)[number];

export type QuestionStatus = EvaluationResult["task_coverage"][number]["status"];

export function languageBandOf(level: CefrLevel): LanguageBand {
  const rank = cefrRank(level);
  if (rank < cefrRank("B1")) return "below_b1";
  if (rank < cefrRank("B2")) return "b1";
  if (rank < cefrRank("C1")) return "b2";
  return "above_b2";
}

export function bandFor(language: LanguageBand, questionsOnTopic: number): PartTwoBand {
  const n = Math.max(0, Math.min(3, questionsOnTopic));
  if (language === "below_b1" || n === 0) return 0;
  if (language === "b1") return Math.min(n, 2) as PartTwoBand;
  if (language === "b2") return (n + 1) as PartTwoBand;
  return (n + 2) as PartTwoBand;
}

export interface BandDerivation {
  band: PartTwoBand;
  language: LanguageBand;
  /** The CEFR level the language band was taken from (median of the features). */
  languageLevel: CefrLevel;
  featureLevels: Record<LanguageFeature, CefrLevel | null>;
  overallLevel: CefrLevel;
  /** Status per task point index 0–2 ("missing" when the evaluator left it out). */
  questionStatuses: (QuestionStatus | "missing")[];
  questionsOnTopic: number;
}

export function deriveBand(result: EvaluationResult): BandDerivation {
  const featureLevels = Object.fromEntries(
    LANGUAGE_FEATURES.map((f) => [f, result.criteria[f].assessable ? result.criteria[f].level : null]),
  ) as Record<LanguageFeature, CefrLevel | null>;
  const levels = Object.values(featureLevels)
    .filter((l): l is CefrLevel => l !== null)
    .sort((a, b) => cefrRank(a) - cefrRank(b));
  // Median (lower middle for an even count); fall back to the overall level if no feature was assessable.
  const languageLevel = levels.length ? levels[Math.floor((levels.length - 1) / 2)] : result.overall_level;
  const questionStatuses = [0, 1, 2].map(
    (i) => result.task_coverage.find((c) => c.prompt_index === i)?.status ?? ("missing" as const),
  );
  const questionsOnTopic = questionStatuses.filter((s) => s === "covered" || s === "partly_covered").length;
  const language = languageBandOf(languageLevel);
  return {
    band: bandFor(language, questionsOnTopic),
    language,
    languageLevel,
    featureLevels,
    overallLevel: result.overall_level,
    questionStatuses,
    questionsOnTopic,
  };
}

/** One line for reports: per-feature levels and question statuses. */
export function describeDerivation(d: BandDerivation): string {
  const features = LANGUAGE_FEATURES.map((f) => `${f}=${d.featureLevels[f] ?? "n/a"}`).join(", ");
  const questions = d.questionStatuses.map((s, i) => `Q${i + 1}=${s}`).join(", ");
  return `band ${d.band} · language ${d.language} (median ${d.languageLevel}; ${features}; overall ${d.overallLevel}) · ${d.questionsOnTopic}/3 on topic (${questions})`;
}

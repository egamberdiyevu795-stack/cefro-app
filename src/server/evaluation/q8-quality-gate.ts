import "server-only";
import { isQuoteInTranscript } from "@/domain/evaluation/evidence";
import { POINT_IDS } from "@/domain/speaking/argument-task";
import { q8LevelValue, type Q8Level } from "@/domain/evaluation/q8/levels";
import type { Q8ModelOutput } from "@/domain/evaluation/q8/model-output";

/**
 * Quality gate for Part 3 evaluator output (docs/part3-plan.md, section 7): the Part 2 gate's rules that apply to
 * Part 3 (strict quotes, concrete fixes, no pronunciation from a transcript, strengths only at the target or above),
 * plus the Part 3 additions: point ids exactly F1–F3, A1–A3; `development_evidence` required for `developed`;
 * `prompt_dependence.evidence` quotes checked; `coherent_and_sustained = false` with `own_development` triggers the
 * one regeneration.
 *
 * "reject" violations trigger one regeneration, then a graceful failure; "warn" violations are repaired in place.
 */

export type Q8QualityCode =
  | "schema_invalid"
  | "point_ids_invalid"
  | "quote_not_found"
  | "developed_without_evidence"
  | "dependence_evidence_fabricated"
  | "incoherent_but_own_development"
  | "missing_fix"
  | "pronunciation_from_transcript"
  | "strength_below_c1";

export interface Q8QualityViolation {
  code: Q8QualityCode;
  severity: "reject" | "warn";
  path: string;
  /** Developer-facing. Never shown to students. */
  message: string;
}

export interface Q8QualityReport {
  passed: boolean;
  violations: Q8QualityViolation[];
}

export interface Q8QualityContext {
  transcript: string;
  /** False when pronunciation could only be judged from a transcript (no audio step): it must be not_assessed. */
  audioAssessed: boolean;
}

export function applyQ8QualityGate(output: Q8ModelOutput, context: Q8QualityContext): { result: Q8ModelOutput; report: Q8QualityReport } {
  const violations: Q8QualityViolation[] = [];
  const add = (code: Q8QualityCode, severity: "reject" | "warn", path: string, message: string) =>
    violations.push({ code, severity, path, message });
  const found = (quote: string) => isQuoteInTranscript(quote, context.transcript, { strict: true });
  const result: Q8ModelOutput = structuredClone(output);

  if (result.points.map((p) => p.id).join() !== POINT_IDS.join()) {
    add("point_ids_invalid", "reject", "points", "points must be exactly F1, F2, F3, A1, A2, A3 in this order");
  }

  result.points.forEach((point, i) => {
    if (point.status === "developed" && !point.development_evidence.trim()) {
      add("developed_without_evidence", "reject", `points[${i}].development_evidence`, `${point.id} is developed but has no development evidence`);
    }
    if (point.development_evidence && !found(point.development_evidence)) {
      add("quote_not_found", "reject", `points[${i}].development_evidence`, "development evidence is not in the transcript");
    }
    if (point.evidence && !found(point.evidence)) {
      add("quote_not_found", "reject", `points[${i}].evidence`, "point evidence is not in the transcript");
    }
    if (point.status === "not_addressed" && (point.evidence || point.development_evidence)) {
      add("quote_not_found", "warn", `points[${i}]`, "a point that is not addressed carries no evidence (cleared)");
      point.evidence = "";
      point.development_evidence = "";
    }
  });

  result.own_points = result.own_points.filter((own, i) => {
    if (found(own.evidence)) return true;
    add("quote_not_found", "warn", `own_points[${i}].evidence`, "own point quote not in the transcript (removed)");
    return false;
  });

  result.prompt_dependence.evidence.forEach((quote, i) => {
    if (!found(quote)) add("dependence_evidence_fabricated", "reject", `prompt_dependence.evidence[${i}]`, "dependence evidence is not in the transcript");
  });

  if (!result.coherent_and_sustained && result.prompt_dependence.level === "own_development") {
    add("incoherent_but_own_development", "reject", "coherent_and_sustained", "an answer that is not coherent and sustained cannot be own development");
  }

  for (const feature of ["grammar", "vocabulary", "fluency", "cohesion"] as const) {
    const f = result.features[feature];
    f.evidence = f.evidence.filter((quote, i) => {
      if (found(quote)) return true;
      add("quote_not_found", "warn", `features.${feature}.evidence[${i}]`, "quote not in the transcript (removed)");
      return false;
    });
    if (!f.how_to_improve.trim()) add("missing_fix", "reject", `features.${feature}.how_to_improve`, "no instruction for the next attempt");
  }

  if (!context.audioAssessed && result.features.pronunciation.level !== "not_assessed") {
    add("pronunciation_from_transcript", "warn", "features.pronunciation.level", "pronunciation cannot be judged from a transcript (set to not_assessed)");
    result.features.pronunciation = { level: "not_assessed", evidence: [], note: "", how_to_improve: "", how_to_check: "" };
  }

  result.strengths = result.strengths.filter((strength, i) => {
    const level = result.features[strength.feature].level as Q8Level;
    if (q8LevelValue(level) >= q8LevelValue("C1") && found(strength.quote)) return true;
    add("strength_below_c1", "warn", `strengths[${i}]`, "a strength needs a C1-or-above feature and an exact quote (removed)");
    return false;
  });

  result.errors = result.errors.filter((error, i) => {
    if (found(error.quote)) return true;
    add("quote_not_found", "warn", `errors[${i}].quote`, "error quote not in the transcript (removed)");
    return false;
  });

  return { result, report: { passed: !violations.some((v) => v.severity === "reject"), violations } };
}

import { isQuoteInTranscript } from "@/domain/evaluation/evidence";
import { levelValue, NOT_ASSESSED } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelModelOutput } from "@/domain/evaluation/multilevel/model-output";

/**
 * Quality gate for Multilevel evaluator output.
 *
 * Runs after schema validation and before scoring. It does not second-guess the examiner's judgements; it catches
 * output that is structurally or pedagogically unusable:
 *
 * - "reject" violations (wrong question numbering, fabricated evidence, pronunciation claims from a transcript,
 *   internal field names, missing or generic advice) trigger one controlled regeneration, then a graceful failure;
 * - "warn" violations are repaired in place (an unverifiable quote is removed, a strength below B2 is dropped) and
 *   recorded in the stored quality report.
 *
 * Quotes are checked STRICTLY: word for word against the verbatim transcript (only case, punctuation and fillers are
 * ignored), so a "corrected" quote never passes as the student's words.
 */

export type QualityCode =
  | "schema_invalid"
  | "question_ids_invalid"
  | "quote_not_found"
  | "feature_evidence_fabricated"
  | "feature_without_evidence"
  | "missing_fix"
  | "generic_feedback"
  | "pronunciation_from_transcript"
  | "pronunciation_claim"
  | "internal_field_leak"
  | "strength_below_b2"
  | "memorized_conflict"
  | "missing_retry_review"
  | "retry_review_contradicts_metrics"
  | "unexpected_retry_review";

export interface QualityViolation {
  code: QualityCode;
  severity: "reject" | "warn";
  /** Location in the output, e.g. "features.grammar.evidence[0]". */
  path: string;
  /** Developer-facing description. Never shown to students. */
  message: string;
}

export interface QualityReport {
  passed: boolean;
  violations: QualityViolation[];
}

export interface QualityContext {
  /** Measured facts about this attempt, used to check numeric claims in the retry review. */
  metrics?: { speakingSeconds: number; wordCount: number };
  transcript: string;
  /** Number of questions in the task (ids must be exactly 1..questionCount). */
  questionCount: number;
  hasPreviousAttempt: boolean;
}

const TEXT_FEATURES = ["grammar", "vocabulary", "fluency", "cohesion"] as const;
/** Features whose level must be backed by quotes (fluency may rest on the speech metrics alone). */
const QUOTE_BACKED = new Set<string>(["grammar", "vocabulary", "cohesion"]);

export function applyQualityGate(
  input: MultilevelModelOutput,
  context: QualityContext,
): { result: MultilevelModelOutput; report: QualityReport } {
  const violations: QualityViolation[] = [];
  const add = (severity: QualityViolation["severity"], code: QualityCode, path: string, message: string) =>
    violations.push({ code, severity, path, message });
  const found = (quote: string) => isQuoteInTranscript(quote, context.transcript, { strict: true });

  // Work on a deep copy; repairs never mutate the model output object.
  const result: MultilevelModelOutput = structuredClone(input);

  // ── Questions: exactly 1..n, each once (one 1-based numbering everywhere) ──
  const ids = result.questions.map((q) => q.id).sort((a, b) => a - b);
  const expected = Array.from({ length: context.questionCount }, (_, i) => i + 1);
  if (ids.join() !== expected.join()) {
    add("reject", "question_ids_invalid", "questions", `Question ids are [${ids.join(", ")}], expected [${expected.join(", ")}].`);
  }
  result.questions.sort((a, b) => a.id - b.id);
  result.questions.forEach((q, i) => {
    if (q.evidence.trim() && !found(q.evidence)) {
      add("warn", "quote_not_found", `questions[${i}].evidence`, `Removed unverifiable quote: "${truncate(q.evidence)}"`);
      q.evidence = "";
    }
  });

  // ── Feature evidence ────────────────────────────────────────────────
  for (const feature of TEXT_FEATURES) {
    const f = result.features[feature];
    const given = f.evidence.length;
    f.evidence = f.evidence.filter((quote, i) => {
      const ok = found(quote);
      if (!ok) add("warn", "quote_not_found", `features.${feature}.evidence[${i}]`, `Removed unverifiable quote: "${truncate(quote)}"`);
      return ok;
    });
    if (given > 0 && f.evidence.length === 0) {
      add("reject", "feature_evidence_fabricated", `features.${feature}.evidence`, "None of the quotes given for this level is in the transcript.");
    } else if (given === 0 && QUOTE_BACKED.has(feature)) {
      add("warn", "feature_without_evidence", `features.${feature}.evidence`, "Level given without any quote.");
    }
    if (!f.how_to_improve.trim() || !f.how_to_check.trim() || !f.note.trim()) {
      add("reject", "missing_fix", `features.${feature}`, "An assessed feature needs a note, how_to_improve and how_to_check.");
    } else if (isGeneric(f.how_to_improve) && !hasSpecifics(f.how_to_improve)) {
      add("reject", "generic_feedback", `features.${feature}.how_to_improve`, `Generic advice: "${truncate(f.how_to_improve)}"`);
    }
  }

  // ── Pronunciation is never judged from a transcript (the audio step does it) ──
  if (result.features.pronunciation.level !== NOT_ASSESSED) {
    add("warn", "pronunciation_from_transcript", "features.pronunciation", `Transcript evaluator gave "${result.features.pronunciation.level}"; reset to not_assessed.`);
  }
  result.features.pronunciation = { level: NOT_ASSESSED, evidence: [], note: "", how_to_improve: "", how_to_check: "" };
  for (const [path, text] of studentTexts(result)) {
    const claim = findPronunciationClaim(text);
    if (claim) add("reject", "pronunciation_claim", path, `Pronunciation claim: "${truncate(claim, 200)}"`);
    const leak = INTERNAL_FIELD_NAMES.exec(text);
    if (leak) add("reject", "internal_field_leak", path, `Internal field name "${leak[0]}" in student-facing text: "${truncate(text, 160)}"`);
  }

  // ── Errors and strengths: evidence or nothing ───────────────────────
  result.errors = result.errors.filter((error, i) => {
    const ok = found(error.quote);
    if (!ok) add("warn", "quote_not_found", `errors[${i}].quote`, `Removed error with unverifiable quote: "${truncate(error.quote)}"`);
    return ok;
  });
  result.strengths = result.strengths.filter((strength, i) => {
    if (!found(strength.quote)) {
      add("warn", "quote_not_found", `strengths[${i}].quote`, `Removed strength with unverifiable quote: "${truncate(strength.quote)}"`);
      return false;
    }
    if (levelValue(result.features[strength.feature].level) < levelValue("B2")) {
      add("warn", "strength_below_b2", `strengths[${i}]`, `Removed: ${strength.feature} was judged ${result.features[strength.feature].level}.`);
      return false;
    }
    return true;
  });

  if (result.memorized_or_irrelevant && result.questions.filter((q) => q.status === "on_topic" && q.evidence).length >= 2) {
    add("warn", "memorized_conflict", "memorized_or_irrelevant", "Marked memorised although two or more questions are answered on topic with evidence.");
  }

  // ── Retry review only for retries ───────────────────────────────────
  if (!context.hasPreviousAttempt && result.retry_review) {
    add("warn", "unexpected_retry_review", "retry_review", "First attempt cannot have a retry review; removed.");
    result.retry_review = null;
  }
  if (context.hasPreviousAttempt && !result.retry_review) {
    add("warn", "missing_retry_review", "retry_review", "Retry evaluated without reviewing the previous focus.");
  }
  // A retry review must not claim a measurable target was met when it was not (seen live: "at least 90 seconds"
  // marked achieved with "88 seconds" as the evidence).
  if (result.retry_review && context.metrics) {
    result.retry_review.objectives.forEach((objective, i) => {
      if (objective.outcome !== "achieved") return;
      const unmet = findUnmetTarget(objective.objective, context.metrics!);
      if (!unmet) return;
      add("warn", "retry_review_contradicts_metrics", `retry_review.objectives[${i}]`, `Marked achieved, but ${unmet}`);
      objective.outcome = "partly_achieved";
      objective.evidence = `${objective.evidence.trim()} (Measured: ${unmet}.)`;
    });
  }

  return { result, report: { passed: !violations.some((v) => v.severity === "reject"), violations } };
}

/** Every student-facing string outside the pronunciation feature, with where it came from. */
function studentTexts(result: MultilevelModelOutput): [string, string][] {
  const out: [string, string][] = [];
  result.questions.forEach((q, i) => out.push([`questions[${i}].note`, q.note]));
  for (const feature of TEXT_FEATURES) {
    const f = result.features[feature];
    out.push([`features.${feature}`, [f.note, f.how_to_improve, f.how_to_check].join(" ")]);
  }
  result.strengths.forEach((s, i) => out.push([`strengths[${i}].note`, s.note]));
  result.retry_review?.objectives.forEach((o, i) => out.push([`retry_review.objectives[${i}]`, `${o.objective}. ${o.evidence}`]));
  if (result.retry_review) out.push(["retry_review.summary", result.retry_review.summary]);
  return out;
}

// ── Helpers (exported for tests) ─────────────────────────────────────

/**
 * Find an explicit numeric target in an objective ("at least 90 seconds", "over 100 words") that the
 * measured attempt did not meet. Rates ("100 words per minute") and ranges are deliberately ignored.
 */
export function findUnmetTarget(text: string, metrics: { speakingSeconds: number; wordCount: number }): string | null {
  const pattern = /\b(at least|minimum of|over|above|more than|exceed(?:ing)?)\s+(\d{1,4})\s*(seconds?|secs?|words?)\b(?!\s*(?:per|a|each|every)\b)/gi;
  for (const match of text.matchAll(pattern)) {
    const strict = /^(over|above|more than|exceed)/i.test(match[1]);
    const target = Number(match[2]);
    const isTime = /^sec/i.test(match[3]);
    const actual = isTime ? metrics.speakingSeconds : metrics.wordCount;
    if (strict ? actual <= target : actual < target) {
      return `${actual} ${isTime ? "seconds" : "words"} is not ${strict ? "over" : "at least"} the ${target}-${isTime ? "second" : "word"} target`;
    }
  }
  return null;
}

// "pron(ou|u)nc" covers both the verb ("pronounce", "mispronounced") and the noun ("pronunciation", "mispronunciation").
const PRONUNCIATION_PATTERN = /\b((?:mis)?pron(?:ou|u)nc\w*|accent\w*|intonation|vowels?|consonants?|phonem\w*|word stress)\b/i;
const NEGATED_ASSESSMENT = /\b(not|cannot|can't|couldn't|unable to)\b[^.]*\b(assess\w*|judg\w*|evaluat\w*|hear\w*)\b/i;

export function findPronunciationClaim(text: string): string | null {
  return (
    text
      .split(/(?<=[.!?])\s+/)
      .find((sentence) => PRONUNCIATION_PATTERN.test(sentence) && !NEGATED_ASSESSMENT.test(sentence)) ?? null
  );
}

const GENERIC_PATTERNS = [
  /\b(improve|work on|focus on|practi[cs]e) (your )?(grammar|vocabulary|fluency|pronunciation|english|speaking|cohesion)\b/i,
  /\buse (more )?(advanced|better|richer|wider|more varied|more|a wider range of) (vocabulary|words|grammar|linking words|connectors)\b/i,
  /\b(expand|enrich|broaden) (your )?vocabulary\b/i,
  /\bspeak (more )?fluently\b/i,
  /\bbe more (fluent|accurate|confident)\b/i,
  /\b(give|add|provide) (more )?details?\b/i,
  /\bpracti[cs]e more\b/i,
  /\bmake fewer (grammar )?mistakes\b/i,
];

export function isGeneric(text: string): boolean {
  return GENERIC_PATTERNS.some((pattern) => pattern.test(text));
}

/** Quoted words, numbers or named structures make a statement specific. */
function hasSpecifics(text: string): boolean {
  return /["“”'‘’][^"“”]{2,}["“”'‘’]|\d/.test(text);
}

/** Names of fields the evaluator is given as data (metrics, schema); they are not student vocabulary. */
export const INTERNAL_FIELD_NAMES =
  /\b(timeUsedRatio|wordsPerMinute|lexicalVariety|fillerCount|wordCount|speakingSeconds|repeatedPhrases|repeatedWords|speech_metrics?|memorized_or_irrelevant|how_to_improve|how_to_check|on_topic|off_topic|not_assessed|above_B2|below_B1)\b/;

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}


import { cefrRank, CEFR_LEVELS } from "@/domain/cefr";
import { isQuoteInTranscript, evidenceTokens } from "@/domain/evaluation/evidence";
import type { EvaluationIssue, EvaluationResult } from "@/domain/evaluation/schema";

/**
 * Pedagogical quality gate for AI evaluations.
 *
 * Runs after schema validation and before anything is stored. It does not
 * judge whether the model is "smart"; it catches feedback that is
 * structurally or pedagogically bad:
 *
 * - "reject" violations (fabricated evidence, pronunciation claims from a
 *   transcript, generic advice, duplicates, broken links) trigger one
 *   controlled regeneration, then a graceful failure;
 * - "warn" violations are repaired in place (e.g. an unverifiable quote is
 *   removed) and recorded in the stored quality report.
 *
 * The gate is deliberately conservative to avoid brittleness: it rejects
 * only clear failures and repairs what can be repaired safely.
 */

export type QualityCode =
  | "schema_invalid"
  | "pronunciation_claim"
  | "issue_without_evidence"
  | "quote_not_found"
  | "example_original_not_found"
  | "improved_example_changes_meaning"
  | "improved_example_too_elaborate"
  | "generic_feedback"
  | "duplicate_issue"
  | "duplicate_retry_focus"
  | "retry_focus_unlinked"
  | "retry_focus_criterion_mismatch"
  | "task_coverage_invalid"
  | "missing_retry_review"
  | "unexpected_retry_review"
  | "level_score_mismatch"
  | "issues_reordered"
  | "feedback_too_long";

export interface QualityViolation {
  code: QualityCode;
  severity: "reject" | "warn";
  /** Location in the result, e.g. "issues[1].evidence_quotes[0]". */
  path: string;
  /** Developer-facing description. Never shown to students. */
  message: string;
}

export interface QualityReport {
  passed: boolean;
  violations: QualityViolation[];
}

export interface QualityContext {
  transcript: string;
  /** Number of task points (prompts) in the task. */
  taskPromptCount: number;
  hasPreviousAttempt: boolean;
}

const MAX_FEEDBACK_WORDS = 450;

export function applyQualityGate(
  input: EvaluationResult,
  context: QualityContext,
): { result: EvaluationResult; report: QualityReport } {
  const violations: QualityViolation[] = [];
  const add = (severity: QualityViolation["severity"], code: QualityCode, path: string, message: string) =>
    violations.push({ code, severity, path, message });

  // Work on a deep copy; repairs never mutate the model output object.
  const result: EvaluationResult = structuredClone(input);

  // ── Issue order: most severe first (stable), keeping focus links valid ──
  const order = result.issues.map((issue, index) => ({ issue, index }));
  order.sort((a, b) => SEVERITY_RANK[a.issue.severity] - SEVERITY_RANK[b.issue.severity]);
  if (order.some((entry, position) => entry.index !== position)) {
    add("warn", "issues_reordered", "issues", "Issues were not ordered by severity; reordered.");
    const newIndexOf = new Map(order.map((entry, position) => [entry.index, position]));
    result.issues = order.map((entry) => entry.issue);
    result.retry_focus = result.retry_focus.map((focus) => ({
      ...focus,
      addresses_issue: newIndexOf.get(focus.addresses_issue) ?? focus.addresses_issue,
    }));
  }

  // ── Evidence ────────────────────────────────────────────────────────
  result.issues.forEach((issue, i) => {
    const verified = issue.evidence_quotes.filter((quote) => {
      const found = isQuoteInTranscript(quote, context.transcript);
      if (!found) add("warn", "quote_not_found", `issues[${i}].evidence_quotes`, `Removed unverifiable quote: "${truncate(quote)}"`);
      return found;
    });
    issue.evidence_quotes = verified;

    if (issue.evidence_basis === "transcript_quote" && verified.length === 0) {
      add("reject", "issue_without_evidence", `issues[${i}]`, "Issue claims transcript evidence but no quote was found in the transcript.");
    }

    const original = issue.improved_example.original.trim();
    if (original && !isQuoteInTranscript(original, context.transcript)) {
      add("warn", "example_original_not_found", `issues[${i}].improved_example.original`, `Removed unverifiable original: "${truncate(original)}"`);
      issue.improved_example.original = "";
    }
  });

  result.strengths.forEach((strength, i) => {
    if (strength.evidence_quote.trim() && !isQuoteInTranscript(strength.evidence_quote, context.transcript)) {
      add("warn", "quote_not_found", `strengths[${i}].evidence_quote`, `Removed unverifiable quote: "${truncate(strength.evidence_quote)}"`);
      strength.evidence_quote = "";
    }
  });

  // ── Improved examples must teach, not show off ──────────────────────
  result.issues.forEach((issue, i) => {
    const { original, improved } = issue.improved_example;
    if (!original) return;
    const check = compareImprovedExample(original, improved);
    if (check.meaningChanged) {
      add(
        "reject",
        "improved_example_changes_meaning",
        `issues[${i}].improved_example`,
        `Improved version keeps only ${Math.round(check.overlap * 100)}% of the original's content words.`,
      );
    } else if (check.tooElaborate) {
      add(
        "reject",
        "improved_example_too_elaborate",
        `issues[${i}].improved_example`,
        `Improved version is ${check.lengthRatio.toFixed(1)}x longer than the original.`,
      );
    }
  });

  // ── Pronunciation cannot be judged from a transcript ────────────────
  result.issues.forEach((issue, i) => {
    if (issue.criterion === "pronunciation") {
      add("reject", "pronunciation_claim", `issues[${i}].criterion`, "Issue about pronunciation from a transcript-only evaluation.");
    }
  });
  for (const [path, text] of studentFacingTexts(result)) {
    if (makesPronunciationClaim(text)) {
      add("reject", "pronunciation_claim", path, `Pronunciation claim: "${truncate(text)}"`);
    }
  }

  // ── Generic advice without specifics ────────────────────────────────
  result.issues.forEach((issue, i) => {
    if (isGeneric(issue.problem) && !hasSpecifics(issue.problem)) {
      add("reject", "generic_feedback", `issues[${i}].problem`, `Generic problem statement: "${truncate(issue.problem)}"`);
    }
    if (isGeneric(issue.how_to_fix) && wordCount(issue.how_to_fix) < 12 && !hasSpecifics(issue.how_to_fix)) {
      add("reject", "generic_feedback", `issues[${i}].how_to_fix`, `Generic fix: "${truncate(issue.how_to_fix)}"`);
    }
  });
  result.retry_focus.forEach((focus, i) => {
    if (isGeneric(focus.objective) && !hasSpecifics(focus.objective)) {
      add("reject", "generic_feedback", `retry_focus[${i}].objective`, `Generic retry focus: "${truncate(focus.objective)}"`);
    }
  });

  // ── Repetition ──────────────────────────────────────────────────────
  forEachSimilarPair(result.issues.map((issue) => issue.problem), (a, b) =>
    add("reject", "duplicate_issue", `issues[${b}]`, `Issue ${b} repeats issue ${a}.`),
  );
  forEachSimilarPair(result.retry_focus.map((focus) => focus.objective), (a, b) =>
    add("reject", "duplicate_retry_focus", `retry_focus[${b}]`, `Retry focus ${b} repeats focus ${a}.`),
  );

  // ── Retry focus must come from an identified weakness ───────────────
  result.retry_focus.forEach((focus, i) => {
    const issue: EvaluationIssue | undefined = result.issues[focus.addresses_issue];
    if (!issue) {
      add("reject", "retry_focus_unlinked", `retry_focus[${i}].addresses_issue`, `Points to missing issue ${focus.addresses_issue}.`);
      return;
    }
    if (issue.criterion !== focus.criterion) {
      add("warn", "retry_focus_criterion_mismatch", `retry_focus[${i}].criterion`, "Criterion aligned with the linked issue.");
      focus.criterion = issue.criterion;
    }
  });

  // ── Task coverage ───────────────────────────────────────────────────
  const seenPrompts = new Set<number>();
  result.task_coverage = result.task_coverage.filter((item, i) => {
    const valid = item.prompt_index < context.taskPromptCount && !seenPrompts.has(item.prompt_index);
    if (!valid) add("warn", "task_coverage_invalid", `task_coverage[${i}]`, "Removed out-of-range or duplicate task point.");
    seenPrompts.add(item.prompt_index);
    return valid;
  });
  result.task_coverage.sort((a, b) => a.prompt_index - b.prompt_index);

  // ── Retry review only for retries ───────────────────────────────────
  if (!context.hasPreviousAttempt && result.retry_review) {
    add("warn", "unexpected_retry_review", "retry_review", "First attempt cannot have a retry review; removed.");
    result.retry_review = null;
  }
  if (context.hasPreviousAttempt && !result.retry_review) {
    add("warn", "missing_retry_review", "retry_review", "Retry evaluated without reviewing the previous focus.");
  }

  // ── Consistency and length (warnings only) ──────────────────────────
  const scored = Object.values(result.criteria).filter((c) => c.assessable && c.score !== null);
  if (scored.length > 0) {
    const mean = scored.reduce((sum, c) => sum + (c.score ?? 0), 0) / scored.length;
    const gap = Math.abs(cefrRank(result.overall_level) - cefrRank(scoreToLevel(mean)));
    if (gap > 3) {
      add("warn", "level_score_mismatch", "overall_level", `Overall ${result.overall_level} is far from mean criterion score ${mean.toFixed(1)}.`);
    }
  }
  const feedbackWords = result.issues.reduce(
    (sum, issue) => sum + wordCount([issue.problem, issue.why_it_matters, issue.how_to_fix, issue.improved_example.improved].join(" ")),
    0,
  );
  if (feedbackWords > MAX_FEEDBACK_WORDS) {
    add("warn", "feedback_too_long", "issues", `Issue text is ${feedbackWords} words (limit ${MAX_FEEDBACK_WORDS}).`);
  }

  return { result, report: { passed: !violations.some((v) => v.severity === "reject"), violations } };
}

// ── Helpers (exported for tests) ─────────────────────────────────────

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

const STOPWORDS = new Set(
  (
    "a an the and or but so because if when while then than that this these those it its i me my we our you your he him his she her they them their " +
    "is am are was were be been being have has had do does did will would can could should may might must to of in on at for with by from about as " +
    "into over after before very really just also too not no yes there here what which who how all some any more most much many one"
  ).split(" "),
);

function contentStems(text: string): string[] {
  return evidenceTokens(text)
    .filter((token) => !STOPWORDS.has(token) && token.length > 1)
    .map(stem);
}

/** Crude stemmer: enough to treat "visit/visited/visiting" or "friend/friends" as the same idea. */
function stem(word: string): string {
  return word.length > 5 ? word.slice(0, 5) : word.replace(/(es|s)$/, "");
}

export function compareImprovedExample(original: string, improved: string) {
  const originalStems = contentStems(original);
  const improvedStems = new Set(contentStems(improved));
  const overlap =
    originalStems.length === 0 ? 1 : originalStems.filter((s) => improvedStems.has(s)).length / originalStems.length;
  const originalWords = Math.max(1, wordCount(original));
  const lengthRatio = wordCount(improved) / originalWords;
  return {
    overlap,
    lengthRatio,
    // Only judge meaning when the original carries enough content words.
    meaningChanged: originalStems.length >= 3 && overlap < 0.5,
    tooElaborate: originalWords >= 4 && lengthRatio > 3,
  };
}

const PRONUNCIATION_PATTERN = /\b(pronounc\w*|mispronounc\w*|accent\w*|intonation|vowels?|consonants?|phonem\w*|word stress)\b/i;
const NEGATED_ASSESSMENT = /\b(not|cannot|can't|couldn't|unable to)\b[^.]*\b(assess\w*|judg\w*|evaluat\w*|hear\w*)\b/i;

export function makesPronunciationClaim(text: string): boolean {
  return text
    .split(/(?<=[.!?])\s+/)
    .some((sentence) => PRONUNCIATION_PATTERN.test(sentence) && !NEGATED_ASSESSMENT.test(sentence));
}

const GENERIC_PATTERNS = [
  /\b(improve|work on|focus on|practi[cs]e) (your )?(grammar|vocabulary|fluency|pronunciation|english|speaking)\b/i,
  /\buse (more )?(advanced|better|richer|wider|more varied|more|a wider range of) (vocabulary|words|grammar)\b/i,
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

function forEachSimilarPair(texts: string[], onPair: (a: number, b: number) => void) {
  const sets = texts.map((text) => new Set(contentStems(text)));
  for (let b = 1; b < sets.length; b++) {
    for (let a = 0; a < b; a++) {
      if (jaccard(sets[a], sets[b]) >= 0.7) {
        onPair(a, b);
        break;
      }
    }
  }
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Student-facing text fields, excluding places where pronunciation may legitimately be mentioned as "not assessed". */
function studentFacingTexts(result: EvaluationResult): [string, string][] {
  const out: [string, string][] = [["overall_summary", result.overall_summary]];
  for (const [key, c] of Object.entries(result.criteria)) {
    if (key !== "pronunciation") out.push([`criteria.${key}.justification`, c.justification]);
  }
  result.strengths.forEach((s, i) => out.push([`strengths[${i}]`, `${s.title}. ${s.detail}`]));
  result.issues.forEach((issue, i) =>
    out.push([`issues[${i}]`, [issue.problem, issue.why_it_matters, issue.how_to_fix].join(" ")]),
  );
  result.retry_focus.forEach((f, i) => out.push([`retry_focus[${i}]`, `${f.objective}. ${f.success_check}`]));
  return out;
}

const SCORE_LEVELS = ["A1", "A1", "A2", "A2+", "B1-", "B1", "B1+", "B2", "B2+", "C1", "C1"] as const;
function scoreToLevel(score: number): (typeof CEFR_LEVELS)[number] {
  return SCORE_LEVELS[Math.max(0, Math.min(10, Math.round(score)))];
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

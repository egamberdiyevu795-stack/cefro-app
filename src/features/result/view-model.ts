/**
 * The result page's view model: turns what the pipeline stores for an attempt (status, failure, transcript and the
 * evaluator's `SpeakingEvaluation`) into what the page shows. Pure and browser-safe; no provider is ever called.
 *
 * The page renders only this, so real attempts plug in by building a `ResultSource` from the database instead of
 * from fixtures, with no UI change.
 *
 * The quality-gate report (`evaluation.quality`) is optional and never read: the page needs nothing from it.
 */
import { buildTranscriptFixes, type TranscriptFixesView } from "./transcript-fixes";
import { FEATURES, FEATURE_LABELS, LEVEL_LABELS, ladderOf, levelValue, type Feature, type FeatureLevel, type PronunciationLevel, type QuestionStatus } from "@/domain/evaluation/multilevel/levels";
import { featureLevels, type MultilevelResult, type MultilevelRetryFocus } from "@/domain/evaluation/multilevel/result";
import { examPartLabel, examPartOfResult, firstQuestionNumberOfResult } from "@/domain/speaking/exam-part";
import type { AttemptFailure, AttemptStatus } from "@/domain/speaking/attempt";
import type { BandedResult } from "@/domain/speaking/history";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import type { SpeakingEvaluation } from "@/server/evaluation/speaking-evaluator";

/** The evaluator's return type. The quality report may be missing (the saved fixtures never had it). */
export type ResultEvaluation = Omit<SpeakingEvaluation, "quality"> & Partial<Pick<SpeakingEvaluation, "quality">>;

/** A band and its label, from the rubric config (e.g. `{ band: 3, label: "Lower B2" }`). */
export type BandLabel = { band: number; label: string };

/** Everything the page needs about one attempt, in the shapes the pipeline already stores. */
export interface ResultSource {
  task: Pick<PublicSpeakingTask, "id" | "title" | "part" | "prompts"> & Partial<Pick<PublicSpeakingTask, "delivery">>;
  status: AttemptStatus;
  failure: AttemptFailure | null;
  recordingDurationMs: number;
  /** null until transcription has finished (and when it found no speech). */
  transcript: string | null;
  /** Only the evaluator's result is read (a stored attempt keeps `{ result, meta }`, a fixture the whole evaluation). */
  evaluation: Pick<ResultEvaluation, "result"> | null;
  /** The previous attempt at the same task, for a retry. */
  previous?: { evaluation: Pick<ResultEvaluation, "result"> } | null;
  /** The part's band table (rubric config), for the target's label. */
  bandLabels: readonly BandLabel[];
  /** True when the local development evaluator scored it: the page must say so. */
  isDevelopmentProvider?: boolean;
}

export type ResultPageState =
  | {
      kind: "scoring";
      task: ResultSource["task"];
      step: "saved" | "transcribing" | "scoring";
      transcript: string | null;
      durationMs: number;
      /** A retry: the goal it was given (the previous attempt's first retry focus). */
      goal: string | null;
    }
  | { kind: "not_scored"; task: ResultSource["task"]; reason: "too_short" | "no_speech"; transcript: string | null; wordCount: number | null; durationMs: number }
  | {
      kind: "failed";
      task: ResultSource["task"];
      failure: AttemptFailure | null;
      /**
       * Scoring could not run (no key, no credit, a provider error) AFTER the recording and transcript were saved: the
       * page says "AI score not ready yet" instead of an error, shows the transcript and keeps the recording.
       */
      aiPending: boolean;
      transcript: string | null;
      durationMs: number;
    }
  | { kind: "scored"; view: ResultView };

/** Which page to show for an attempt. */
export function resultPageState(source: ResultSource): ResultPageState {
  const { task } = source;
  if (source.status !== "completed" && source.status !== "failed") {
    const step = source.status === "evaluating" ? "scoring" : source.status === "transcribing" ? "transcribing" : "saved";
    const goal = source.previous?.evaluation.result.retry_focus[0]?.objective ?? null;
    return { kind: "scoring", task, step, transcript: source.transcript, durationMs: source.recordingDurationMs, goal };
  }
  if (source.status === "failed" || !source.evaluation) {
    // transcription_empty = no speech found, or too few words recognised to score.
    if (source.failure?.code === "transcription_empty") {
      return { kind: "not_scored", task, reason: "no_speech", transcript: source.transcript, wordCount: null, durationMs: source.recordingDurationMs };
    }
    return {
      kind: "failed",
      task,
      failure: source.failure,
      aiPending: Boolean(source.transcript?.trim()) && source.failure?.stage === "evaluation",
      transcript: source.transcript,
      durationMs: source.recordingDurationMs,
    };
  }
  const result = source.evaluation.result;
  if (result.scoring.zero_reason === "too_short") {
    // Band 0 because the answer is too short to rate: not a real rating, so no band, questions or skills are shown.
    return {
      kind: "not_scored",
      task,
      reason: "too_short",
      transcript: source.transcript,
      wordCount: source.transcript ? countWords(source.transcript) : null,
      durationMs: source.recordingDurationMs,
    };
  }
  return {
    kind: "scored",
    view: buildResultView(result, {
      task,
      transcript: source.transcript ?? "",
      durationMs: source.recordingDurationMs,
      bandLabels: source.bandLabels,
      previous: source.previous?.evaluation.result ?? null,
      isDevelopmentProvider: source.isDevelopmentProvider ?? false,
    }),
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */

export type QuestionVerdict = "answered" | "partly" | "not_counted";

export interface QuestionRow {
  id: number;
  /** The number the student saw ("Question 4" for the first question of Part 1.2). */
  number: number;
  prompt: string;
  verdict: QuestionVerdict;
  /** "Answered", "Partly answered", "Not answered", "Off topic", "Too short to count". */
  verdictLabel: string;
  /** One line: the evaluator's note on what the student said. */
  reason: string;
  /** A partly answered question's own hint, word for word from the task (Part 1.2 Question 4: "talk about both pictures"). */
  hint: string | null;
}

export interface BiggestFixView {
  /** Caption, e.g. "Grammar · B1" or "Question 3 · Not answered". */
  label: string;
  /** What the quote is: the student's words, or (when nothing was said) the question they missed. */
  quoteKind: "student" | "question";
  /** "You said" (an error, or their words for a question), "Your best sentence" (a listed strength), "You didn't answer". */
  quoteLabel: string;
  quote: string;
  /** "Try instead" after an error or a missed question; "Next step" when the quote is not an error. */
  adviceLabel: "Try instead" | "Next step";
  tryInstead: string;
  /** The retry goal (the evaluator's first retry focus). Omitted when it would repeat `tryInstead`. */
  goal: string | null;
  /** How the student can tell, after the retry, that it worked. */
  check: string | null;
}

/** A repeated mistake: the evaluator's pattern name, how many of the listed errors it covers, and one of them. */
export interface PatternRow {
  name: string;
  count: number;
  quote: string;
}

/** At most this many patterns are shown. */
export const MAX_PATTERNS = 3;

export interface SkillRow {
  feature: Feature;
  name: string;
  /** null = not assessed (pronunciation when the audio step did not run). */
  level: FeatureLevel | null;
  levelLabel: string;
  quote: string | null;
  /** From the evaluator's lists: a strength ("What you did well") or an error ("To improve"); null when they don't say. */
  quoteLabel: SkillQuoteLabel | null;
  note: string;
  /** Retries: the level last time, when it differs. */
  previousLevelLabel: string | null;
}

export interface RetryComparison {
  previousBand: number;
  band: number;
  /** "met" / "partly" / "not_met"; null when it can't be judged (e.g. the goal was pronunciation, not assessed). */
  goal: "met" | "partly" | "not_met" | null;
  goalText: string | null;
}

export interface ResultView {
  taskTitle: string;
  part: number;
  /** "Part 2", "Part 1.1", "Part 1.2". */
  partLabel: string;
  band: number;
  bandMax: number;
  bandLabel: string;
  /** "Part 2 · Band 2 · Higher B1" */
  headline: string;
  /** `text` for below / at the target; above it, `above` instead (the lime label, and the next band if there is one). */
  target: { band: number; label: string; distance: number; text: string; above: { next: string | null } | null };
  /** True when pronunciation was not assessed: the band may change once it is. */
  provisional: boolean;
  zeroReason: MultilevelResult["scoring"]["zero_reason"];
  questions: QuestionRow[];
  fix: BiggestFixView;
  /** "Patterns in this answer": empty when the evaluator listed none (the section is then hidden). */
  patterns: PatternRow[];
  skills: SkillRow[];
  pronunciationNote: string | null;
  transcript: string;
  /** The transcript with the student's mistakes marked; null for a result scored before evaluator 3.6.0 (no list). */
  transcriptFixes: TranscriptFixesView | null;
  durationMs: number;
  retry: RetryComparison | null;
  /** Scored by the local development evaluator, not a real assessment. */
  developmentEvaluator: boolean;
}

const VERDICT: Record<QuestionStatus, { verdict: QuestionVerdict; label: string }> = {
  on_topic: { verdict: "answered", label: "Answered" },
  partial: { verdict: "partly", label: "Partly answered" },
  minimal: { verdict: "not_counted", label: "Too short to count" },
  missing: { verdict: "not_counted", label: "Not answered" },
  off_topic: { verdict: "not_counted", label: "Off topic" },
};

const AUDIO_REASON: Record<NonNullable<MultilevelResult["audio"]["reason"]>, string> = {
  disabled: "Pronunciation wasn't checked in this attempt.",
  no_audio: "Pronunciation wasn't checked in this attempt: there was no recording to listen to.",
  failed: "Pronunciation wasn't checked in this attempt: the audio check failed.",
  unclear: "Pronunciation wasn't checked in this attempt: the recording was too unclear.",
};

export function buildResultView(
  result: MultilevelResult,
  ctx: {
    task: Pick<PublicSpeakingTask, "title" | "prompts"> & Partial<Pick<PublicSpeakingTask, "delivery">>;
    transcript: string;
    durationMs: number;
    bandLabels: readonly BandLabel[];
    previous?: MultilevelResult | null;
    isDevelopmentProvider?: boolean;
  },
): ResultView {
  const s = result.scoring;
  const targetLabel = ctx.bandLabels.find((b) => b.band === s.target_band)?.label ?? `Band ${s.target_band}`;
  const distance = s.target_band - s.band;
  const prev = ctx.previous ?? null;
  const examPart = examPartOfResult(result);
  const partLabel = examPart ? examPartLabel(examPart) : `Part ${result.part}`;
  const first = firstQuestionNumberOfResult(result);

  return {
    taskTitle: ctx.task.title,
    part: result.part,
    partLabel,
    band: s.band,
    bandMax: s.band_max,
    bandLabel: s.label,
    headline: `${partLabel} · Band ${s.band} · ${s.label}`,
    target: {
      band: s.target_band,
      label: targetLabel,
      distance,
      text: distanceText(distance, s.target_band, targetLabel),
      above: distance < 0 ? { next: nextBand(s.band, s.band_max, ctx.bandLabels) } : null,
    },
    provisional: s.provisional,
    zeroReason: s.zero_reason,
    questions: result.assessment.questions.map((q) => {
      const hint = q.status === "partial" ? ctx.task.delivery?.questions[q.id - 1]?.partialHint : undefined;
      return {
        id: q.id,
        number: first + q.id - 1,
        prompt: ctx.task.prompts[q.id - 1] ?? `Question ${first + q.id - 1}`,
        verdict: VERDICT[q.status].verdict,
        verdictLabel: VERDICT[q.status].label,
        reason: q.note,
        hint: hint ? `Next time, ${hint}.` : null,
      };
    }),
    fix: biggestFix(result, ctx.task.prompts, ctx.transcript),
    patterns: patternRows(result),
    // Only the part's own skills (Part 1.1 has no cohesion).
    skills: FEATURES.filter((feature) => result.assessment.features[feature]).map((feature) => skillRow(result, feature, prev)),
    pronunciationNote: result.audio.status === "not_assessed" ? AUDIO_REASON[result.audio.reason ?? "disabled"] : null,
    transcript: ctx.transcript,
    transcriptFixes: buildTranscriptFixes(ctx.transcript, result.assessment.sentence_fixes, [], result.assessment.strengths.map((s) => s.quote)),
    durationMs: ctx.durationMs,
    retry: prev ? compareWithPrevious(prev, result) : null,
    developmentEvaluator: ctx.isDevelopmentProvider ?? false,
  };
}

function distanceText(distance: number, targetBand: number, targetLabel: string): string {
  const target = `Band ${targetBand} · ${targetLabel}`;
  const bands = (n: number) => `${n} ${n === 1 ? "band" : "bands"}`;
  if (distance > 0) return `${bands(distance)} to your target, ${target}`;
  if (distance === 0) return `Target reached: ${target}`;
  return "Above your target";
}

function nextBand(band: number, bandMax: number, labels: readonly BandLabel[]): string | null {
  if (band >= bandMax) return null;
  const label = labels.find((b) => b.band === band + 1)?.label;
  return `Band ${band + 1}${label ? ` · ${label}` : ""}`;
}

export type SkillQuoteLabel = "What you did well" | "To improve";

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
/** Both are exact substrings of the transcript, so one containing the other means they quote the same words. */
const sameWords = (a: string, b: string) => norm(a).includes(norm(b)) || norm(b).includes(norm(a));

/**
 * A skill's quote and what it shows, only from the evaluator's own lists: `strengths` (B2-or-better language) and
 * `errors` (grammar / vocabulary). The first evidence quote keeps its place when a list names it; otherwise the
 * skill's listed strength, else its listed error. When no list says, the first quote is shown without a label.
 */
function skillQuote(result: MultilevelResult, feature: Feature): { quote: string | null; label: SkillQuoteLabel | null } {
  const a = result.assessment;
  const strengths = a.strengths.filter((s) => s.feature === feature);
  const errors = a.errors.filter((e) => e.type === feature);
  const first = a.features[feature]?.evidence[0];
  if (first) {
    const good = strengths.some((s) => sameWords(s.quote, first));
    const bad = errors.some((e) => sameWords(e.quote, first));
    if (good !== bad) return { quote: first, label: good ? "What you did well" : "To improve" };
    if (good && bad) return { quote: first, label: null };
  }
  if (strengths[0]) return { quote: strengths[0].quote, label: "What you did well" };
  if (errors[0]) return { quote: errors[0].quote, label: "To improve" };
  return { quote: first ?? null, label: null };
}

/**
 * The evaluator's error patterns, in its own order (most important first), each with the number of listed errors that
 * belong to it and the first one's quote. A pattern no listed error belongs to has no quote and is left out.
 */
function patternRows(result: MultilevelResult): PatternRow[] {
  const { errors, error_patterns } = result.assessment;
  return error_patterns
    .map((p) => {
      const own = errors.filter((e) => e.pattern === p.name);
      return own.length ? { name: p.name, count: own.length, quote: own[0].quote } : null;
    })
    .filter((row): row is PatternRow => row !== null)
    .slice(0, MAX_PATTERNS);
}

function skillRow(result: MultilevelResult, feature: Feature, prev: MultilevelResult | null): SkillRow {
  const f = result.assessment.features[feature]!;
  const level = assessedLevel(f.level);
  const prevFeature = prev?.assessment.features[feature];
  const prevLevel = prevFeature ? assessedLevel(prevFeature.level) : null;
  return {
    feature,
    name: FEATURE_LABELS[feature],
    level,
    levelLabel: level ? LEVEL_LABELS[level] : "Not assessed",
    ...(() => {
      const { quote, label } = skillQuote(result, feature);
      return { quote, quoteLabel: label };
    })(),
    note: f.note,
    previousLevelLabel: prevLevel && level && prevLevel !== level ? LEVEL_LABELS[prevLevel] : null,
  };
}

function assessedLevel(level: PronunciationLevel): FeatureLevel | null {
  return level === "not_assessed" ? null : level;
}

/**
 * The main card. Same choice as the band logic ("biggest_fix"):
 * - a feature: the student's first error of that type and its correction; with no error, their own words as
 *   evidence and the evaluator's instruction;
 * - a question: what they said for it (or the question itself when they said nothing) and the model answer;
 * - own words: how their answer started and the model answer to question 1.
 * The goal is always the evaluator's first retry focus, the one "Retry with this goal" carries.
 */
/** The result page's Biggest fix card for one result; also the dashboard's. */
export function biggestFix(result: MultilevelResult, prompts: readonly string[], transcript: string): BiggestFixView {
  const fix = result.scoring.biggest_fix;
  const focus: MultilevelRetryFocus | undefined = result.retry_focus[0];
  const a = result.assessment;
  const withGoal = (view: Omit<BiggestFixView, "goal" | "check">): BiggestFixView => ({
    ...view,
    goal: focus && focus.objective !== view.tryInstead ? focus.objective : null,
    check: focus?.success_check ?? null,
  });

  if (fix.kind === "feature" && a.features[fix.feature]) {
    const f = a.features[fix.feature]!;
    const level = assessedLevel(f.level);
    const label = `${FEATURE_LABELS[fix.feature]}${level ? ` · ${LEVEL_LABELS[level]}` : ""}`;
    const error = a.errors.find((e) => e.type === fix.feature);
    if (error) {
      const pattern = error.pattern && a.error_patterns.find((p) => p.name === error.pattern);
      return withGoal({
        label: pattern ? `${label} · ${pattern.name}` : label,
        quoteKind: "student",
        quoteLabel: "You said",
        quote: error.quote,
        adviceLabel: "Try instead",
        tryInstead: error.correction,
      });
    }
    // Not an error: their listed strength for this skill is "Your best sentence"; without one, their own words, unlabelled as best.
    const strength = a.strengths.find((x) => x.feature === fix.feature);
    return withGoal({
      label,
      quoteKind: "student",
      quoteLabel: strength ? "Your best sentence" : "You said",
      quote: strength?.quote ?? f.evidence[0] ?? firstSentence(transcript),
      adviceLabel: "Next step",
      tryInstead: f.how_to_improve || (focus?.objective ?? ""),
    });
  }

  if (fix.kind === "question_coverage") {
    const q = a.questions.find((x) => x.id === fix.question_id);
    const shown = firstQuestionNumberOfResult(result) + fix.question_id - 1;
    const prompt = prompts[fix.question_id - 1] ?? `Question ${shown}`;
    const label = `Question ${shown} · ${q ? VERDICT[q.status].label : "Not answered"}`;
    const said = q?.evidence.trim();
    return withGoal({
      label,
      quoteKind: said ? "student" : "question",
      quoteLabel: said ? "You said" : "You didn't answer",
      quote: said || prompt,
      adviceLabel: "Try instead",
      tryInstead: q?.model_answer || `Answer it directly, then give a reason or an example.`,
    });
  }

  const example = a.questions.find((q) => q.model_answer)?.model_answer;
  return withGoal({
    label: "Own words · Answer the questions",
    quoteKind: "student",
    quoteLabel: "You said",
    quote: firstSentence(transcript),
    adviceLabel: "Try instead",
    tryInstead: example || `Start by answering question ${firstQuestionNumberOfResult(result)} directly, in your own words.`,
  });
}

/**
 * Did the retry reach the goal it was given? The evaluator's own retry review wins when there is one; otherwise it is
 * read from the judgements: the previous attempt's first retry focus, checked against this attempt.
 */
export function compareWithPrevious(prev: MultilevelResult, current: MultilevelResult): RetryComparison {
  const focus = prev.retry_focus[0];
  const reviewed = current.assessment.retry_review?.objectives[0]?.outcome;
  let goal: RetryComparison["goal"] = null;
  if (reviewed) goal = reviewed === "achieved" ? "met" : reviewed === "partly_achieved" ? "partly" : "not_met";
  else if (focus) {
    const t = focus.target;
    if (t.kind === "feature") {
      const beforeFeature = prev.assessment.features[t.feature];
      const afterFeature = current.assessment.features[t.feature];
      const before = beforeFeature ? assessedLevel(beforeFeature.level) : null;
      const after = afterFeature ? assessedLevel(afterFeature.level) : null;
      const ladder = ladderOf([...Object.values(featureLevels(prev.assessment)), ...Object.values(featureLevels(current.assessment))]);
      goal = before && after ? (levelValue(after, ladder) > levelValue(before, ladder) ? "met" : "not_met") : null;
    } else if (t.kind === "question") {
      const status = current.assessment.questions.find((q) => q.id === t.question_id)?.status;
      goal = status === "on_topic" ? "met" : status === "partial" ? "partly" : "not_met";
    } else {
      goal = !current.assessment.memorized_or_irrelevant && current.scoring.on_topic_count > 0 ? "met" : "not_met";
    }
  }
  return { previousBand: prev.scoring.band, band: current.scoring.band, goal, goalText: focus?.objective ?? null };
}

/**
 * Did a retry meet its goal, for any pair of banded results? Part 1/2 pairs are judged as the result page judges them
 * (`compareWithPrevious`); Part 3 pairs by the Part 3 evaluator's own retry review (the only check Part 3 stores,
 * as its result page reads it); a mixed pair (the task kind changed) can't be judged.
 */
export function goalOutcomeOf(prev: BandedResult, current: BandedResult): RetryComparison["goal"] {
  if (prev.kind === "multilevel" && current.kind === "multilevel") return compareWithPrevious(prev, current).goal;
  if (prev.kind === "multilevel_q8" && current.kind === "multilevel_q8") {
    const outcome = current.assessment.retry_review?.objectives[0]?.outcome;
    return outcome === "achieved" ? "met" : outcome === "partly_achieved" ? "partly" : outcome === "not_achieved" ? "not_met" : null;
  }
  return null;
}

/** Two answers for the student: met, or not yet. "Partly" is still "Not yet", with a quieter note that it is close. */
export const GOAL_LABEL: Record<NonNullable<RetryComparison["goal"]>, "Goal met" | "Not yet"> = { met: "Goal met", partly: "Not yet", not_met: "Not yet" };
export const GOAL_NOTE: Partial<Record<NonNullable<RetryComparison["goal"]>, string>> = { partly: "partly there" };

function firstSentence(text: string): string {
  const match = text.trim().match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : text).trim();
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

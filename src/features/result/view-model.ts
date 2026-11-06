/**
 * The result page's view model: turns what the pipeline stores for an attempt (status, failure, transcript and the
 * evaluator's `SpeakingEvaluation`) into what the page shows. Pure and browser-safe; no provider is ever called.
 *
 * The page renders only this, so real attempts plug in by building a `ResultSource` from the database instead of
 * from fixtures, with no UI change.
 *
 * The quality-gate report (`evaluation.quality`) is optional and never read: the page needs nothing from it.
 */
import { FEATURES, FEATURE_LABELS, LEVEL_LABELS, levelValue, type Feature, type FeatureLevel, type PronunciationLevel, type QuestionStatus } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult, MultilevelRetryFocus } from "@/domain/evaluation/multilevel/result";
import type { AttemptFailure, AttemptStatus } from "@/domain/speaking/attempt";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import type { SpeakingEvaluation } from "@/server/evaluation/speaking-evaluator";

/** The evaluator's return type. The quality report may be missing (the saved fixtures never had it). */
export type ResultEvaluation = Omit<SpeakingEvaluation, "quality"> & Partial<Pick<SpeakingEvaluation, "quality">>;

/** A band and its label, from the rubric config (e.g. `{ band: 3, label: "Lower B2" }`). */
export type BandLabel = { band: number; label: string };

/** Everything the page needs about one attempt, in the shapes the pipeline already stores. */
export interface ResultSource {
  task: Pick<PublicSpeakingTask, "id" | "title" | "part" | "prompts">;
  status: AttemptStatus;
  failure: AttemptFailure | null;
  recordingDurationMs: number;
  /** null until transcription has finished (and when it found no speech). */
  transcript: string | null;
  evaluation: ResultEvaluation | null;
  /** The previous attempt at the same task, for a retry. */
  previous?: { evaluation: ResultEvaluation } | null;
  /** The part's band table (rubric config), for the target's label. */
  bandLabels: readonly BandLabel[];
}

export type ResultPageState =
  | { kind: "scoring"; task: ResultSource["task"]; step: "saved" | "transcribing" | "scoring"; transcript: string | null; durationMs: number }
  | { kind: "not_scored"; task: ResultSource["task"]; reason: "too_short" | "no_speech"; transcript: string | null; wordCount: number | null; durationMs: number }
  | { kind: "failed"; task: ResultSource["task"]; failure: AttemptFailure | null }
  | { kind: "scored"; view: ResultView };

/** Which page to show for an attempt. */
export function resultPageState(source: ResultSource): ResultPageState {
  const { task } = source;
  if (source.status !== "completed" && source.status !== "failed") {
    const step = source.status === "evaluating" ? "scoring" : source.status === "transcribing" ? "transcribing" : "saved";
    return { kind: "scoring", task, step, transcript: source.transcript, durationMs: source.recordingDurationMs };
  }
  if (source.status === "failed" || !source.evaluation) {
    // transcription_empty = no speech found, or too few words recognised to score.
    if (source.failure?.code === "transcription_empty") {
      return { kind: "not_scored", task, reason: "no_speech", transcript: source.transcript, wordCount: null, durationMs: source.recordingDurationMs };
    }
    return { kind: "failed", task, failure: source.failure };
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
    }),
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */

export type QuestionVerdict = "answered" | "partly" | "not_counted";

export interface QuestionRow {
  id: number;
  prompt: string;
  verdict: QuestionVerdict;
  /** "Answered", "Partly answered", "Not answered", "Off topic", "Too short to count". */
  verdictLabel: string;
  /** One line: the evaluator's note on what the student said. */
  reason: string;
}

export interface BiggestFixView {
  /** Caption, e.g. "Grammar · B1" or "Question 3 · Not answered". */
  label: string;
  /** What the quote is: the student's words, or (when nothing was said) the question they missed. */
  quoteKind: "student" | "question";
  quote: string;
  tryInstead: string;
  /** The retry goal (the evaluator's first retry focus). Omitted when it would repeat `tryInstead`. */
  goal: string | null;
  /** How the student can tell, after the retry, that it worked. */
  check: string | null;
}

export interface SkillRow {
  feature: Feature;
  name: string;
  /** null = not assessed (pronunciation when the audio step did not run). */
  level: FeatureLevel | null;
  levelLabel: string;
  quote: string | null;
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
  band: number;
  bandMax: number;
  bandLabel: string;
  /** "Part 2 · Band 2 · Higher B1" */
  headline: string;
  target: { band: number; label: string; distance: number; text: string };
  /** True when pronunciation was not assessed: the band may change once it is. */
  provisional: boolean;
  zeroReason: MultilevelResult["scoring"]["zero_reason"];
  questions: QuestionRow[];
  fix: BiggestFixView;
  skills: SkillRow[];
  pronunciationNote: string | null;
  transcript: string;
  durationMs: number;
  retry: RetryComparison | null;
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
  ctx: { task: Pick<PublicSpeakingTask, "title" | "prompts">; transcript: string; durationMs: number; bandLabels: readonly BandLabel[]; previous?: MultilevelResult | null },
): ResultView {
  const s = result.scoring;
  const targetLabel = ctx.bandLabels.find((b) => b.band === s.target_band)?.label ?? `Band ${s.target_band}`;
  const distance = s.target_band - s.band;
  const prev = ctx.previous ?? null;

  return {
    taskTitle: ctx.task.title,
    part: result.part,
    band: s.band,
    bandMax: s.band_max,
    bandLabel: s.label,
    headline: `Part ${result.part} · Band ${s.band} · ${s.label}`,
    target: { band: s.target_band, label: targetLabel, distance, text: distanceText(distance, s.target_band, targetLabel) },
    provisional: s.provisional,
    zeroReason: s.zero_reason,
    questions: result.assessment.questions.map((q) => ({
      id: q.id,
      prompt: ctx.task.prompts[q.id - 1] ?? `Question ${q.id}`,
      verdict: VERDICT[q.status].verdict,
      verdictLabel: VERDICT[q.status].label,
      reason: q.note,
    })),
    fix: biggestFix(result, ctx.task.prompts, ctx.transcript),
    skills: FEATURES.map((feature) => skillRow(result, feature, prev)),
    pronunciationNote: result.audio.status === "not_assessed" ? AUDIO_REASON[result.audio.reason ?? "disabled"] : null,
    transcript: ctx.transcript,
    durationMs: ctx.durationMs,
    retry: prev ? compareWithPrevious(prev, result) : null,
  };
}

function distanceText(distance: number, targetBand: number, targetLabel: string): string {
  const target = `Band ${targetBand} · ${targetLabel}`;
  const bands = (n: number) => `${n} ${n === 1 ? "band" : "bands"}`;
  if (distance > 0) return `${bands(distance)} to your target, ${target}`;
  if (distance === 0) return `Target reached: ${target}`;
  return `${bands(-distance)} above your target, ${target}`;
}

function skillRow(result: MultilevelResult, feature: Feature, prev: MultilevelResult | null): SkillRow {
  const f = result.assessment.features[feature];
  const level = assessedLevel(f.level);
  const prevLevel = prev ? assessedLevel(prev.assessment.features[feature].level) : null;
  return {
    feature,
    name: FEATURE_LABELS[feature],
    level,
    levelLabel: level ? LEVEL_LABELS[level] : "Not assessed",
    quote: f.evidence[0] ?? null,
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
function biggestFix(result: MultilevelResult, prompts: readonly string[], transcript: string): BiggestFixView {
  const fix = result.scoring.biggest_fix;
  const focus: MultilevelRetryFocus | undefined = result.retry_focus[0];
  const a = result.assessment;
  const withGoal = (view: Omit<BiggestFixView, "goal" | "check">): BiggestFixView => ({
    ...view,
    goal: focus && focus.objective !== view.tryInstead ? focus.objective : null,
    check: focus?.success_check ?? null,
  });

  if (fix.kind === "feature") {
    const f = a.features[fix.feature];
    const level = assessedLevel(f.level);
    const label = `${FEATURE_LABELS[fix.feature]}${level ? ` · ${LEVEL_LABELS[level]}` : ""}`;
    const error = a.errors.find((e) => e.type === fix.feature);
    if (error) {
      const pattern = error.pattern && a.error_patterns.find((p) => p.name === error.pattern);
      return withGoal({ label: pattern ? `${label} · ${pattern.name}` : label, quoteKind: "student", quote: error.quote, tryInstead: error.correction });
    }
    return withGoal({ label, quoteKind: "student", quote: f.evidence[0] ?? firstSentence(transcript), tryInstead: f.how_to_improve || (focus?.objective ?? "") });
  }

  if (fix.kind === "question_coverage") {
    const q = a.questions.find((x) => x.id === fix.question_id);
    const prompt = prompts[fix.question_id - 1] ?? `Question ${fix.question_id}`;
    const label = `Question ${fix.question_id} · ${q ? VERDICT[q.status].label : "Not answered"}`;
    const said = q?.evidence.trim();
    return withGoal({
      label,
      quoteKind: said ? "student" : "question",
      quote: said || prompt,
      tryInstead: q?.model_answer || `Answer it directly, then give a reason or an example.`,
    });
  }

  const example = a.questions.find((q) => q.model_answer)?.model_answer;
  return withGoal({
    label: "Own words · Answer the questions",
    quoteKind: "student",
    quote: firstSentence(transcript),
    tryInstead: example || "Start by answering question 1 directly, in your own words.",
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
      const before = assessedLevel(prev.assessment.features[t.feature].level);
      const after = assessedLevel(current.assessment.features[t.feature].level);
      goal = before && after ? (levelValue(after) > levelValue(before) ? "met" : "not_met") : null;
    } else if (t.kind === "question") {
      const status = current.assessment.questions.find((q) => q.id === t.question_id)?.status;
      goal = status === "on_topic" ? "met" : status === "partial" ? "partly" : "not_met";
    } else {
      goal = !current.assessment.memorized_or_irrelevant && current.scoring.on_topic_count > 0 ? "met" : "not_met";
    }
  }
  return { previousBand: prev.scoring.band, band: current.scoring.band, goal, goalText: focus?.objective ?? null };
}

export const GOAL_LABEL: Record<NonNullable<RetryComparison["goal"]>, string> = { met: "Goal met", partly: "Goal partly met", not_met: "Goal not met yet" };

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

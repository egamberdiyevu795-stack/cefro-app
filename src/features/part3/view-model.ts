/**
 * The Part 3 result page's view model: turns a stored Part 3 result (`Q8Result`) into what the page shows. Pure and
 * browser-safe. The page renders only this, so a real Part 3 attempt plugs in later with no UI change.
 */
import { FEATURES, FEATURE_LABELS, type Feature } from "@/domain/evaluation/multilevel/levels";
import { tokenize } from "@/domain/evaluation/multilevel/prompt-overlap";
import { Q8_LEVEL_LABELS, type Q8Level } from "@/domain/evaluation/q8/levels";
import type { PointStatus } from "@/domain/evaluation/q8/model-output";
import { CHOOSE_TWO, EXPLAIN_HEADLINE, OWN_WORDS_HEADLINE, REBUTTAL_HEADLINE, type Q8Result } from "@/domain/evaluation/q8/result";
import { SIDE_LABELS, pointById, type PointId, type PublicArgumentTask, type Side } from "@/domain/speaking/argument-task";

export type PointVerdict = "developed" | "stated" | "not_used" | "misread";

export interface PointRow {
  id: PointId;
  text: string;
  /** Ticked on the preparation screen. */
  chosen: boolean;
  verdict: PointVerdict;
  verdictLabel: string;
  note: string;
  /** The student's words for it (empty when not used). */
  quote: string;
}

export interface SideView {
  side: Side;
  title: string;
  /** "2 used · 1 developed". */
  summary: string;
  points: PointRow[];
}

export interface FixView {
  label: string;
  quoteKind: "student" | "task";
  quoteLabel: string;
  quote: string;
  adviceLabel: "Try instead" | "Next step";
  tryInstead: string;
  goal: string | null;
  check: string | null;
}

export interface SkillView {
  feature: Feature;
  name: string;
  level: Q8Level | null;
  levelLabel: string;
  previousLevelLabel: string | null;
  quote: string | null;
  note: string | null;
}

export type GoalOutcome = "met" | "partly" | "not_met";

export interface Part3ResultView {
  taskTitle: string;
  statement: string;
  band: number;
  bandLabel: string;
  bandMax: number;
  targetBand: number;
  headline: string;
  targetText: string;
  zeroText: string | null;
  provisional: boolean;
  sides: [SideView, SideView];
  chooseTwo: boolean;
  ownPoints: { side: Side; quote: string }[];
  dependence: { label: string; note: string; copied: string[] };
  fix: FixView;
  skills: SkillView[];
  transcript: { text: string; copied: boolean }[];
  durationMs: number;
  retry: { previousBand: number; band: number; goal: GoalOutcome | null; goalText: string | null } | null;
  developmentEvaluator: boolean;
}

export const GOAL_TEXT: Record<GoalOutcome, string> = { met: "Goal met", partly: "Not yet", not_met: "Not yet" };

const VERDICT_LABEL: Record<PointVerdict, string> = {
  developed: "Developed",
  stated: "Stated, no reason",
  not_used: "Not used",
  misread: "Misread",
};

const DEPENDENCE_LABEL = {
  own_development: "In your own words",
  heavily_dependent: "Leaning on the list",
  reads_prompts: "Read from the list",
} as const;

const ZERO_TEXT = {
  memorized_or_irrelevant: "Band 0 because the answer doesn't argue this statement: it sounds prepared or is about something else.",
  no_point_addressed: "Band 0 because no point from either list was used.",
  below_B1: "Band 0 because the language is below B1.",
} as const;

function verdictOf(status: PointStatus): PointVerdict {
  return status === "developed" ? "developed" : status === "restated" ? "stated" : status === "misread" ? "misread" : "not_used";
}

/** Character ranges of the transcript's tokens, normalised exactly as `tokenize` normalises them. */
function tokenRanges(transcript: string): { start: number; end: number; norm: string }[] {
  const ranges: { start: number; end: number; norm: string }[] = [];
  for (const match of transcript.matchAll(/[\p{L}\p{N}'‘’ʼ`´]+/gu)) {
    const [norm] = tokenize(match[0]);
    if (!norm) continue;
    ranges.push({ start: match.index!, end: match.index! + match[0].length, norm });
  }
  return ranges;
}

/** The transcript in pieces, with the runs copied from the lists (measured by prompt-overlap.ts) marked. */
export function markCopied(transcript: string, spans: readonly string[]): { text: string; copied: boolean }[] {
  const tokens = tokenRanges(transcript);
  // Tokenizing one word can split it (hyphens): keep this simple and exact, a run matches whole tokens in order.
  const marks: [number, number][] = [];
  let from = 0;
  for (const span of spans) {
    const words = span.split(" ");
    for (let i = from; i + words.length <= tokens.length; i++) {
      if (words.every((w, k) => tokens[i + k].norm === w)) {
        marks.push([tokens[i].start, tokens[i + words.length - 1].end]);
        from = i + words.length;
        break;
      }
    }
  }
  const pieces: { text: string; copied: boolean }[] = [];
  let at = 0;
  for (const [start, end] of marks) {
    if (start > at) pieces.push({ text: transcript.slice(at, start), copied: false });
    pieces.push({ text: transcript.slice(start, end), copied: true });
    at = end;
  }
  if (at < transcript.length) pieces.push({ text: transcript.slice(at), copied: false });
  return pieces.filter((p) => p.text.length > 0);
}

function goalOutcome(result: Q8Result): GoalOutcome | null {
  const outcome = result.assessment.retry_review?.objectives[0]?.outcome;
  return outcome === "achieved" ? "met" : outcome === "partly_achieved" ? "partly" : outcome === "not_achieved" ? "not_met" : null;
}

export function buildPart3View(
  result: Q8Result,
  context: {
    task: Pick<PublicArgumentTask, "title" | "statement" | "points">;
    transcript: string;
    durationMs: number;
    bandLabels: readonly { band: number; label: string }[];
    previous: Q8Result | null;
    isDevelopmentProvider: boolean;
  },
): Part3ResultView {
  const { task } = context;
  const s = result.scoring;
  const a = result.assessment;
  const targetLabel = context.bandLabels.find((b) => b.band === s.target_band)?.label ?? "C1";
  const gap = s.target_band - s.band;
  const targetText =
    gap > 0
      ? `Target: band ${s.target_band} (${targetLabel}). You are ${gap} ${gap === 1 ? "band" : "bands"} below it.`
      : gap === 0
        ? `You reached your target: band ${s.target_band} (${targetLabel}).`
        : `Above your target of band ${s.target_band} (${targetLabel}).`;

  const side = (which: Side): SideView => {
    const rows = a.points
      .filter((p) => pointById(task, p.id).side === which)
      .map((p): PointRow => {
        const verdict = verdictOf(p.status);
        return {
          id: p.id,
          text: pointById(task, p.id).text,
          chosen: result.chosen_points.includes(p.id),
          verdict,
          verdictLabel: verdict === "stated" && p.rebutted ? "Stated, then argued against" : VERDICT_LABEL[verdict],
          note: p.note,
          quote: verdict === "not_used" ? "" : p.development_evidence || p.evidence,
        };
      });
    const count = s.sides[which];
    return {
      side: which,
      title: SIDE_LABELS[which].toUpperCase(),
      summary: `${count.covered} used · ${count.developed} developed`,
      points: rows,
    };
  };

  const pieces = markCopied(context.transcript, result.overlap.copied_spans);
  const copiedSentences = sentencesWithCopies(context.transcript, pieces);

  const previousLevels = context.previous?.assessment.features;
  const skills = FEATURES.map((feature): SkillView => {
    const f = a.features[feature];
    const level = f.level === "not_assessed" ? null : (f.level as Q8Level);
    const before = previousLevels?.[feature].level;
    const previousLevelLabel = before && before !== "not_assessed" && level && before !== level ? Q8_LEVEL_LABELS[before as Q8Level] : null;
    return {
      feature,
      name: FEATURE_LABELS[feature],
      level,
      levelLabel: level ? Q8_LEVEL_LABELS[level] : "Not assessed",
      previousLevelLabel,
      quote: f.evidence[0] ?? null,
      note: f.note || null,
    };
  });

  return {
    taskTitle: task.title,
    statement: task.statement,
    band: s.band,
    bandLabel: s.label,
    bandMax: s.band_max,
    targetBand: s.target_band,
    headline: `Part 3 · Band ${s.band} · ${s.label}`,
    targetText,
    zeroText: s.zero_reason ? ZERO_TEXT[s.zero_reason] : null,
    provisional: s.provisional,
    sides: [side("for"), side("against")],
    chooseTwo: s.needs_two_points_per_side,
    ownPoints: a.own_points.map((p) => ({ side: p.side, quote: p.evidence })),
    dependence: { label: DEPENDENCE_LABEL[s.dependence], note: a.prompt_dependence.note, copied: copiedSentences },
    fix: fixView(result, task, copiedSentences),
    skills,
    transcript: pieces,
    durationMs: context.durationMs,
    retry: context.previous
      ? { previousBand: context.previous.scoring.band, band: s.band, goal: goalOutcome(result), goalText: context.previous.retry_focus[0]?.objective ?? null }
      : null,
    developmentEvaluator: context.isDevelopmentProvider,
  };
}

/** The sentences of the transcript that contain a copied run, as the student said them. */
function sentencesWithCopies(transcript: string, pieces: { text: string; copied: boolean }[]): string[] {
  if (!pieces.some((p) => p.copied)) return [];
  const sentences = transcript.match(/[^.!?]+[.!?]*/g) ?? [];
  const copied = pieces.filter((p) => p.copied).map((p) => p.text);
  return sentences.map((s) => s.trim()).filter((s) => copied.some((c) => s.includes(c)));
}

function fixView(result: Q8Result, task: Pick<PublicArgumentTask, "points">, copied: string[]): FixView {
  const fix = result.scoring.biggest_fix;
  const a = result.assessment;
  const focus = result.retry_focus[0];
  const goalFor = (tryInstead: string) => ({
    goal: focus && focus.objective !== tryInstead ? focus.objective : null,
    check: focus?.success_check ?? null,
  });
  const firstSentence = (a.points.find((p) => p.evidence)?.evidence ?? "").trim();
  const pointText = (id: PointId) => `${id}. ${pointById(task, id).text}`;

  switch (fix.kind) {
    case "own_words":
      return {
        label: "Own words",
        quoteKind: "student",
        quoteLabel: "Your answer began",
        quote: firstSentence || a.features.grammar.evidence[0] || "",
        adviceLabel: "Next step",
        tryInstead: "Argue the statement you were given, with points from both lists.",
        ...goalFor(""),
      };
    case "prompt_dependence": {
      const headline = fix.level === "reads_prompts" ? OWN_WORDS_HEADLINE : EXPLAIN_HEADLINE;
      return {
        label: `Words from the list · ${DEPENDENCE_LABEL[fix.level]}`,
        quoteKind: "student",
        quoteLabel: "You said, word for word from the list",
        quote: copied[0] ?? a.prompt_dependence.evidence[0] ?? firstSentence,
        adviceLabel: "Next step",
        tryInstead: headline,
        ...goalFor(headline),
      };
    }
    case "section_coverage": {
      const point = a.points.find((p) => p.id === fix.point_id);
      const sideName = fix.missing_side === "both" ? "Both sides" : `${SIDE_LABELS[fix.missing_side].toUpperCase()} side`;
      const tryInstead = point?.model_answer || CHOOSE_TWO;
      return {
        label: `${sideName} · Not used`,
        quoteKind: "task",
        quoteLabel: "A point you could use",
        quote: pointText(fix.point_id),
        adviceLabel: "Try instead",
        tryInstead,
        ...goalFor(tryInstead),
      };
    }
    case "point_development": {
      const sideName = `${SIDE_LABELS[fix.side].toUpperCase()} side`;
      if (fix.reason === "too_few_points" || fix.point_id === null) {
        const used = result.scoring.sides[fix.side].covered;
        return {
          label: `${sideName} · ${used} of 2 points`,
          quoteKind: "task",
          quoteLabel: "What the task asks",
          quote: CHOOSE_TWO,
          adviceLabel: "Next step",
          tryInstead: `Add a second ${SIDE_LABELS[fix.side].toUpperCase()} point and give it a reason or an example.`,
          ...goalFor(""),
        };
      }
      const point = a.points.find((p) => p.id === fix.point_id)!;
      if (fix.reason === "rebutted") {
        return {
          label: `${fix.point_id} · Stated, then argued against`,
          quoteKind: "student",
          quoteLabel: "You said",
          quote: point.evidence,
          adviceLabel: "Next step",
          tryInstead: REBUTTAL_HEADLINE,
          ...goalFor(REBUTTAL_HEADLINE),
        };
      }
      const tryInstead = point.model_answer || `Give a reason or an example for ${fix.point_id}.`;
      return {
        label: `${fix.point_id} · Stated, no reason`,
        quoteKind: "student",
        quoteLabel: "You said",
        quote: point.evidence,
        adviceLabel: "Try instead",
        tryInstead,
        ...goalFor(tryInstead),
      };
    }
    case "feature": {
      const f = a.features[fix.feature];
      const error = a.errors.find((e) => e.type === fix.feature);
      const label = `${FEATURE_LABELS[fix.feature]} · ${f.level === "not_assessed" ? "Not assessed" : Q8_LEVEL_LABELS[f.level as Q8Level]}`;
      if (error) {
        return { label, quoteKind: "student", quoteLabel: "You said", quote: error.quote, adviceLabel: "Try instead", tryInstead: error.correction, ...goalFor(error.correction) };
      }
      const tryInstead = f.how_to_improve;
      return {
        label,
        quoteKind: "student",
        quoteLabel: "Your words",
        quote: f.evidence[0] ?? firstSentence,
        adviceLabel: "Next step",
        tryInstead,
        ...goalFor(tryInstead),
      };
    }
  }
}

import { z } from "zod";

/**
 * Prompt overlap for Part 3 (balanced argument): how much of the transcript was read out from the task text.
 *
 * Pure and deterministic (docs/part3-plan.md, section 6). The model's dependence judgement decides the band; this
 * module measures the same thing in code so that the one clear case can be overridden, disagreements can be flagged,
 * and the student can be shown which of their sentences came from the list.
 *
 *  1. Normalise transcript and prompt text: lowercase, unify apostrophes, strip punctuation, split into word tokens.
 *     The prompt is the statement plus the six points, each a separate segment (n-grams never cross segments).
 *  2. Matched runs: maximal runs of transcript tokens covered by n-grams (default 4) that also occur in a segment.
 *  3. Named vs copied: a run followed (within the next 20 tokens) by ≥ 5 distinct novel content words is "named",
 *     i.e. the point was used as a heading and then developed in the student's own words. Otherwise it is "copied".
 *  4. Metrics are computed from copied runs only.
 */

export type PromptDependence = "own_development" | "heavily_dependent" | "reads_prompts";

export const PROMPT_DEPENDENCE_LEVELS = ["own_development", "heavily_dependent", "reads_prompts"] as const satisfies readonly PromptDependence[];

/** All thresholds live here so a rubric file can carry them; nothing below has its own numbers. */
export const promptOverlapConfigSchema = z.object({
  /** Shortest run of shared tokens that counts as a match. */
  min_run_tokens: z.number().int().min(2),
  /** How many tokens after a run are inspected for the student's own words. */
  named_window_tokens: z.number().int().min(1),
  /** Distinct novel content words needed in that window for the run to count as "named". */
  named_min_novel_words: z.number().int().min(1),
  /** Share of a point's own n-grams that must lie inside copied runs for the point to count as read. */
  point_read_coverage: z.number().min(0).max(1),
  reads_prompts: z.object({
    copied_ratio: z.number().min(0).max(1),
    points_read: z.number().int().min(0),
  }),
  heavily_dependent: z.object({
    copied_ratio: z.number().min(0).max(1),
    points_read: z.number().int().min(0),
    /** Fewer novel content words than this means heavily dependent. */
    min_novel_content_words: z.number().int().min(0),
  }),
  /** Clear case where code overrides the model (decision 4): both conditions must hold. */
  override: z.object({
    copied_ratio: z.number().min(0).max(1),
    points_read: z.number().int().min(0),
  }),
});

export type PromptOverlapConfig = z.infer<typeof promptOverlapConfigSchema>;

/** Thresholds from docs/part3-plan.md section 6. Flag-only except for the override (decisions 4 and 6). */
export const DEFAULT_PROMPT_OVERLAP_CONFIG: PromptOverlapConfig = {
  min_run_tokens: 4,
  named_window_tokens: 20,
  named_min_novel_words: 5,
  point_read_coverage: 0.8,
  reads_prompts: { copied_ratio: 0.5, points_read: 4 },
  heavily_dependent: { copied_ratio: 0.2, points_read: 2, min_novel_content_words: 25 },
  override: { copied_ratio: 0.5, points_read: 4 },
};

export interface PromptText {
  statement: string;
  /** The listed points (F1–F3, A1–A3). Only these count towards points_read; the statement does not. */
  points: readonly { id: string; text: string }[];
}

export interface MatchedRun {
  /** Token index of the first token in the run (inclusive). */
  start: number;
  /** Token index after the last token in the run (exclusive). */
  end: number;
  /** The run's tokens joined by spaces (normalised text). */
  text: string;
  kind: "named" | "copied";
  /** Distinct novel content words found in the window after the run. */
  novel_words_after: number;
}

export interface PromptOverlap {
  token_count: number;
  /** Share of transcript tokens inside copied runs (0–1, unrounded). */
  copied_ratio: number;
  /** Points whose own n-grams are mostly inside copied runs. */
  points_read: number;
  points_read_ids: string[];
  /** Distinct transcript words that are neither stopwords nor in the prompt vocabulary. */
  novel_content_words: number;
  /** Runs classed as named. Reported only, never penalised. */
  named_runs: number;
  /** Normalised text of each copied run, in transcript order. Shown to the student and used as evidence. */
  copied_spans: string[];
  runs: MatchedRun[];
  /** Dependence level by code alone (section 6 rules). */
  code_dependence: PromptDependence;
}

/**
 * Function words (the NLTK English list plus common function-word contractions). A word on this list never counts as
 * "novel content", so linking words cannot make a read-out look like the student's own development.
 */
const STOPWORDS = new Set(
  (
    "i me my myself we our ours ourselves you you're you've you'll you'd your yours yourself yourselves he him his " +
    "himself she she's her hers herself it it's its itself they them their theirs themselves what which who whom " +
    "this that that'll these those am is are was were be been being have has had having do does did doing a an the " +
    "and but if or because as until while of at by for with about against between into through during before after " +
    "above below to from up down in out on off over under again further then once here there when where why how " +
    "all any both each few more most other some such no nor not only own same so than too very s t can will just " +
    "don don't should should've now d ll m o re ve y ain aren aren't couldn couldn't didn didn't doesn doesn't " +
    "hadn hadn't hasn hasn't haven haven't isn isn't ma mightn mightn't mustn mustn't needn needn't shan shan't " +
    "shouldn shouldn't wasn wasn't weren weren't won won't wouldn wouldn't" +
    " i'm i'd i'll i've we're we'd we'll we've they're they'd they'll he's he'd she'd that's what's there's let's can't"
  ).split(" "),
);

/** Lowercase, unify apostrophes, drop other punctuation (hyphens and dashes split words), split into tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .split(" ")
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token.length > 0);
}

function ngrams(tokens: readonly string[], n: number): string[] {
  const result: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) result.push(tokens.slice(i, i + n).join(" "));
  return result;
}

function isNovelContentWord(word: string, promptVocabulary: ReadonlySet<string>): boolean {
  return !STOPWORDS.has(word) && !promptVocabulary.has(word) && !/^\d+$/.test(word);
}

export function measurePromptOverlap(
  transcript: string,
  prompt: PromptText,
  config: PromptOverlapConfig = DEFAULT_PROMPT_OVERLAP_CONFIG,
): PromptOverlap {
  const n = config.min_run_tokens;
  const tokens = tokenize(transcript);
  const segments = [prompt.statement, ...prompt.points.map((p) => p.text)].map(tokenize);
  const promptVocabulary = new Set(segments.flat());
  const promptNgrams = new Set(segments.flatMap((segment) => ngrams(segment, n)));

  // 1. Mark every transcript token covered by a shared n-gram, then collect maximal runs.
  const covered = new Array<boolean>(tokens.length).fill(false);
  for (let i = 0; i + n <= tokens.length; i++) {
    if (promptNgrams.has(tokens.slice(i, i + n).join(" "))) covered.fill(true, i, i + n);
  }

  const runs: MatchedRun[] = [];
  for (let i = 0; i < tokens.length; ) {
    if (!covered[i]) {
      i++;
      continue;
    }
    let end = i;
    while (end < tokens.length && covered[end]) end++;
    // 2. Named vs copied, from the student's own words right after the run.
    const window = tokens.slice(end, end + config.named_window_tokens);
    const novelAfter = new Set(window.filter((w) => isNovelContentWord(w, promptVocabulary))).size;
    runs.push({
      start: i,
      end,
      text: tokens.slice(i, end).join(" "),
      kind: novelAfter >= config.named_min_novel_words ? "named" : "copied",
      novel_words_after: novelAfter,
    });
    i = end;
  }

  // 3. Metrics from copied runs only.
  const copiedRuns = runs.filter((run) => run.kind === "copied");
  const copiedTokenCount = copiedRuns.reduce((sum, run) => sum + (run.end - run.start), 0);
  const copiedNgrams = new Set(copiedRuns.flatMap((run) => ngrams(tokens.slice(run.start, run.end), n)));

  const pointsReadIds = prompt.points
    .filter((point) => {
      const own = [...new Set(ngrams(tokenize(point.text), n))];
      if (own.length === 0) return false;
      const inside = own.filter((gram) => copiedNgrams.has(gram)).length;
      return inside / own.length >= config.point_read_coverage;
    })
    .map((point) => point.id);

  const novelContentWords = new Set(tokens.filter((w) => isNovelContentWord(w, promptVocabulary))).size;
  const copiedRatio = tokens.length === 0 ? 0 : copiedTokenCount / tokens.length;

  return {
    token_count: tokens.length,
    copied_ratio: copiedRatio,
    points_read: pointsReadIds.length,
    points_read_ids: pointsReadIds,
    novel_content_words: novelContentWords,
    named_runs: runs.length - copiedRuns.length,
    copied_spans: copiedRuns.map((run) => run.text),
    runs,
    code_dependence: codeDependence(
      { copied_ratio: copiedRatio, points_read: pointsReadIds.length, novel_content_words: novelContentWords },
      config,
    ),
  };
}

type DependenceMetrics = Pick<PromptOverlap, "copied_ratio" | "points_read" | "novel_content_words">;

/** Dependence level from the metrics alone (section 6). Used for the disagreement flag, not for the band. */
export function codeDependence(metrics: DependenceMetrics, config: PromptOverlapConfig = DEFAULT_PROMPT_OVERLAP_CONFIG): PromptDependence {
  const reads = config.reads_prompts;
  if (metrics.copied_ratio >= reads.copied_ratio || metrics.points_read >= reads.points_read) return "reads_prompts";
  const heavy = config.heavily_dependent;
  if (
    metrics.copied_ratio >= heavy.copied_ratio ||
    metrics.points_read >= heavy.points_read ||
    metrics.novel_content_words < heavy.min_novel_content_words
  ) {
    return "heavily_dependent";
  }
  return "own_development";
}

export interface DependenceDecision {
  /** The level used for the band. */
  final: PromptDependence;
  model: PromptDependence;
  code: PromptDependence;
  /** True when code replaced the model's level (the clear case only, decision 4). */
  override_applied: boolean;
  /** Code and model disagree. Logged for the threshold review (decision 6), never applied on its own. */
  dependence_disagreement: boolean;
}

/**
 * Combine the model's judgement with the measured overlap (decision 4): the model decides, except in the clear case
 * (copied_ratio ≥ override ratio AND points_read ≥ override count), where the result is reads_prompts.
 */
export function decideDependence(
  model: PromptDependence,
  overlap: Pick<PromptOverlap, "copied_ratio" | "points_read" | "code_dependence">,
  config: PromptOverlapConfig = DEFAULT_PROMPT_OVERLAP_CONFIG,
): DependenceDecision {
  const clearCase = overlap.copied_ratio >= config.override.copied_ratio && overlap.points_read >= config.override.points_read;
  const final: PromptDependence = clearCase ? "reads_prompts" : model;
  return {
    final,
    model,
    code: overlap.code_dependence,
    override_applied: final !== model,
    dependence_disagreement: overlap.code_dependence !== model,
  };
}

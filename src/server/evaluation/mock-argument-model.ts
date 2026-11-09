import "server-only";
import { measurePromptOverlap, tokenize } from "@/domain/evaluation/multilevel/prompt-overlap";
import { q8LevelFromValue, type Q8Level } from "@/domain/evaluation/q8/levels";
import type { Q8ModelOutput } from "@/domain/evaluation/q8/model-output";
import { goalPoint } from "@/domain/evaluation/q8/result";
import { pointById, sideOf } from "@/domain/speaking/argument-task";
import type { ArgumentEvaluationInput, ArgumentEvaluationModel } from "./argument-types";
import { MOCK_B2_LINKERS, MOCK_C1_MARKERS, mockCount, mockJudgePoints, mockSentences } from "./mock-argument-rules";
import type { ModelEvaluationOutput } from "./types";

/**
 * Development-only Part 3 evaluator. Produces a schema-valid, gate-clean Part 3 judgement from simple transcript rules
 * (`mock-argument-rules.ts`) so the Part 3 demo runs with no API key and no model call. It is NOT an assessment: every
 * note says "Development estimate", and the result page names the development evaluator.
 *
 * Prompt dependence: the mock takes the level measured in code (prompt-overlap.ts) as its "model" judgement.
 * Never above_C1 (band 6 is covered by the scorer's tests). It must not invent progress: a retry goal is only
 * "achieved" when it can be checked from the transcript.
 */
export class MockArgumentModel implements ArgumentEvaluationModel {
  readonly provider = "mock";
  readonly model = "argument-heuristic-dev-1";
  readonly isDevelopmentProvider = true;
  readonly config = {};

  constructor(private readonly options: { delayMs?: number } = {}) {}

  async evaluate(_prompt: unknown, input: ArgumentEvaluationInput): Promise<ModelEvaluationOutput> {
    const delayMs = this.options.delayMs ?? 0;
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { output: buildMockArgument(input), provider: this.provider, model: this.model, inputTokens: null, outputTokens: null };
  }
}

/** A frame for a point the answer did not develop, on that point only (never a ready-made answer on the topic). */
function mockPointAnswer(id: string, text: string): string {
  return `Name ${id} ("${text}") in a few words, then add one reason and one example of your own that support it.`;
}

export function buildMockArgument(input: ArgumentEvaluationInput): Q8ModelOutput {
  const { task, transcript, metrics, previousAttempt } = input;
  const sentences = mockSentences(transcript);
  const judged = mockJudgePoints(task.id, transcript);
  const overlap = measurePromptOverlap(transcript, { statement: task.statement, points: task.points }, input.rubric.config.overlap);
  const dependence = overlap.code_dependence;

  const c1 = mockCount(transcript, MOCK_C1_MARKERS);
  const b2 = mockCount(transcript, MOCK_B2_LINKERS);
  const length = metrics.wordCount >= 150 ? 3 : metrics.wordCount >= 100 ? 2 : metrics.wordCount >= 50 ? 1 : 0;
  const variety = metrics.lexicalVariety ?? 0;
  const grammar = q8LevelFromValue(Math.min(length, c1 >= 2 ? 3 : 2));
  const vocabulary = q8LevelFromValue(Math.min(length, variety >= 0.5 ? (c1 >= 2 ? 3 : 2) : variety >= 0.35 ? 1 : 0));
  const cohesion: Q8Level = c1 >= 3 ? "C1" : b2 >= 2 || c1 >= 1 ? "B2" : length >= 1 ? "B1" : "below_B1";
  const fluency: Q8Level = metrics.fillerCount >= 6 ? "B1" : grammar;
  const markerSentence = sentences.find((s) => mockCount(s, MOCK_C1_MARKERS) > 0) ?? "";
  const first = sentences[0] ?? "";

  const feature = (level: Q8Level, evidence: string, note: string, how_to_improve: string, how_to_check: string) => ({
    level,
    evidence: evidence ? [evidence] : [],
    note,
    how_to_improve,
    how_to_check,
  });

  // Sentences that hold a copied run of the list, as evidence of leaning on it.
  const copied = new Set(overlap.copied_spans);
  const dependenceEvidence =
    dependence === "own_development" ? [] : sentences.filter((s) => [...copied].some((span) => tokenize(s).join(" ").includes(span))).slice(0, 4);

  const point = (j: (typeof judged)[number]) => {
    const text = pointById(task, j.id).text;
    const side = sideOf(j.id) === "for" ? "FOR" : "AGAINST";
    const note =
      j.status === "developed"
        ? `Development estimate: you support ${j.id} with a reason or an example.`
        : j.rebutted
          ? `Development estimate: you state ${j.id} only to argue against it, so the ${side} side gets no reason of its own.`
          : j.status === "restated"
            ? `Development estimate: you name ${j.id} but add no reason or example.`
            : `Development estimate: ${j.id} is not in your answer.`;
    return { ...j, note, model_answer: j.status === "developed" ? "" : mockPointAnswer(j.id, text) };
  };

  return {
    points: judged.map(point),
    own_points: [],
    prompt_dependence: {
      level: dependence,
      evidence: dependenceEvidence,
      note:
        dependence === "own_development"
          ? "Development estimate: you build the argument in your own words."
          : dependence === "heavily_dependent"
            ? "Development estimate: much of your answer repeats the wording of the lists."
            : "Development estimate: your answer reads out the statement and the lists.",
    },
    coherent_and_sustained: dependence === "own_development",
    conclusion: /\b(on balance|all things considered|having weighed|to sum up|in conclusion|overall)\b/i.test(transcript) ? "weighed" : "none",
    features: {
      grammar: feature(
        grammar,
        markerSentence || first,
        "Development estimate from the length and range of your answer.",
        // Examples on a topic of their own, never the statement's (docs/feedback-review.md, issue 3).
        "Use one structure that puts the key idea first, for example 'What surprised me most was the weather'.",
        "One of your sentences starts with the idea you want to stress, not with 'I think'.",
      ),
      vocabulary: feature(
        vocabulary,
        first,
        "Development estimate from how many different words you used.",
        "Use one precise word instead of a general one when you give a reason, for example 'crowded' instead of 'very full'.",
        "When you listen back, each reason uses at least one exact word, not only 'good' or 'bad'.",
      ),
      fluency: feature(
        fluency,
        "",
        `Development estimate: ${metrics.fillerCount} hesitation sounds in ${metrics.speakingSeconds} seconds.`,
        "Plan the first words of each point during preparation, so you move from one point to the next without stopping.",
        "You start each new point without 'um' or 'uh'.",
      ),
      cohesion: feature(
        cohesion,
        markerSentence || first,
        c1 ? "Development estimate: you link the two sides with less common linking words." : "Development estimate: your points are linked mostly with simple words.",
        "Use one linker that turns from one side to the other, for example 'That said' when you move from benefits to problems.",
        "You hear a clear turn from the FOR side to the AGAINST side when you listen back.",
      ),
      pronunciation: { level: "not_assessed", evidence: [], note: "", how_to_improve: "", how_to_check: "" },
    },
    memorized_or_irrelevant: false,
    errors: [],
    error_patterns: [],
    strengths: cohesion === "C1" && markerSentence ? [{ feature: "cohesion", quote: markerSentence, note: "You move between the two sides with a clear linker." }] : [],
    retry_review: previousAttempt
      ? {
          objectives: previousAttempt.retryFocus.map((focus) => reviewObjective(focus.objective, judged)),
          summary: "Development evaluator: only goals that can be checked from the transcript were checked.",
        }
      : null,
  };
}

/** A "two points from each list" goal is met when both sides have two; a goal about one point when that point is now developed. */
function reviewObjective(objective: string, judged: ReturnType<typeof mockJudgePoints>) {
  if (/two points from each list/i.test(objective)) {
    const count = (side: "for" | "against") => judged.filter((j) => sideOf(j.id) === side && (j.status === "developed" || j.status === "restated")).length;
    const both = count("for") >= 2 && count("against") >= 2;
    return { objective, outcome: both ? ("achieved" as const) : ("not_achieved" as const), evidence: `FOR: ${count("for")} points, AGAINST: ${count("against")} points.` };
  }
  const id = goalPoint(objective);
  if (id) {
    const status = judged.find((j) => j.id === id)?.status ?? "not_addressed";
    return {
      objective,
      outcome: status === "developed" ? ("achieved" as const) : status === "restated" ? ("partly_achieved" as const) : ("not_achieved" as const),
      evidence: `${id} is ${status === "developed" ? "supported with a reason" : status === "restated" ? "named but not supported" : "not in this answer"}.`,
    };
  }
  return { objective, outcome: "not_achieved" as const, evidence: "The development evaluator cannot check this goal." };
}

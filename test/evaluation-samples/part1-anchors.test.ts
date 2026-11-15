import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { scoreBand, type BandScoringInput } from "@/domain/evaluation/multilevel/band-scoring";
import type { FeatureLevel, QuestionStatus } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelModelOutput } from "@/domain/evaluation/multilevel/model-output";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import type { SpeakingTask } from "@/domain/speaking/task";
import { buildMultilevelEvaluationPrompt } from "@/server/evaluation/prompts/multilevel-evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import type { EvaluationInput, EvaluationModel } from "@/server/evaluation/types";
import { PART1_ANCHORS, type Part1Anchor } from "./part1-anchors";

const part11 = getSpeakingTask("a2-part1-1-daily-life")!;
const part12 = getSpeakingTask("b1-part1-2-shopping")!;
const taskOf = (anchor: Pick<Part1Anchor, "part">) => (anchor.part === "1.1" ? part11 : part12);
const configOf = (task: SpeakingTask) => getSpeakingRubric(task).config;

function judgements(anchor: Part1Anchor): BandScoringInput {
  return {
    questions: anchor.statuses.map((status, i) => ({ id: i + 1, status })),
    features: { ...anchor.levels, pronunciation: "not_assessed" },
    memorizedOrIrrelevant: false,
  };
}

/** The model's output for an anchor: its judgements, with each answer quoted as its evidence. */
function modelOutput(anchor: Part1Anchor): MultilevelModelOutput {
  const feature = (level: FeatureLevel, quote: string) => ({
    level,
    evidence: [quote],
    note: "You answer in short sentences.",
    how_to_improve: "Use 'because' once in each answer, e.g. 'I like trains because they are fast'.",
    how_to_check: "Each answer has 'because' once.",
  });
  const quote = anchor.answers[0].split(/(?<=[.!?…])\s+/)[0];
  return {
    questions: anchor.statuses.map((status, i) => ({
      id: i + 1,
      status,
      evidence: status === "missing" ? "" : anchor.answers[i],
      note: "About this question.",
      model_answer: status === "on_topic" ? "" : "I usually … because …",
    })),
    features: {
      grammar: feature(anchor.levels.grammar, quote),
      vocabulary: feature(anchor.levels.vocabulary, quote),
      fluency: feature(anchor.levels.fluency, quote),
      ...(anchor.levels.cohesion ? { cohesion: feature(anchor.levels.cohesion, quote) } : {}),
      pronunciation: { level: "not_assessed", evidence: [], note: "", how_to_improve: "", how_to_check: "" },
    },
    memorized_or_irrelevant: false,
    errors: [],
    error_patterns: [],
    strengths: [],
    retry_review: null,
  };
}

function inputFor(task: SpeakingTask, transcript: string): EvaluationInput {
  return {
    task,
    rubric: getSpeakingRubric(task),
    transcript,
    metrics: computeSpeechMetrics(transcript, 60_000, task.speakingSeconds),
    audio: { storageProvider: "test", storageKey: "k", mimeType: "audio/webm", durationMs: 60_000 },
    previousAttempt: null,
  };
}

const returning = (output: unknown): EvaluationModel => ({
  provider: "test",
  model: "test",
  isDevelopmentProvider: false,
  config: {},
  evaluate: async () => ({ output, provider: "test", model: "test", inputTokens: null, outputTokens: null }),
});

describe("Part 1 anchors (docs/part1-plan.md §4): expected judgements → the band the code computes", () => {
  it("has the six anchors, three per part", () => {
    expect(PART1_ANCHORS.map((a) => a.id)).toEqual(["1.1-low", "1.1-middle", "1.1-high", "1.2-low", "1.2-middle", "1.2-high"]);
  });

  it.each(PART1_ANCHORS.map((a) => [a.id, a] as const))("%s → band %#", (_id, anchor) => {
    const score = scoreBand(judgements(anchor), configOf(taskOf(anchor)));
    expect(score).toMatchObject({ band: anchor.band, label: anchor.label, biggest_fix: anchor.fix, meets_target: anchor.meetsTarget, provisional: true });
  });

  it("1.2-middle tests the rounding rule: mean 1.5 rounds DOWN to A2", () => {
    const score = scoreBand(judgements(PART1_ANCHORS.find((a) => a.id === "1.2-middle")!), configOf(part12));
    expect(score.language_mean).toBe(1.5);
    expect(score.language_level).toBe("A2");
  });

  it.each(PART1_ANCHORS.map((a) => [a.id, a] as const))("%s: through the real evaluation (schema, quality gate, scoring)", async (_id, anchor) => {
    const task = taskOf(anchor);
    const evaluation = await evaluateSpeaking(inputFor(task, anchor.answers.join(" ")), returning(modelOutput(anchor)));
    expect(evaluation.quality.passed).toBe(true);
    expect(evaluation.result.scoring.band).toBe(anchor.band);
    expect(evaluation.result.rubric_id).toBe(task.rubricId);
    expect(evaluation.rubricVersion).toBe(getSpeakingRubric(task).version);
  });

  it("anchor answers are test-only: never in a prompt, never imported by app code", () => {
    for (const anchor of PART1_ANCHORS) {
      const task = taskOf(anchor);
      const prompt = buildMultilevelEvaluationPrompt(inputFor(task, "Hello."));
      for (const answer of anchor.answers) {
        const probe = answer.split(/\s+/).slice(0, 6).join(" ");
        expect(prompt.system).not.toContain(probe);
        expect(prompt.user).not.toContain(probe);
        expect(task.evaluatorGuidance).not.toContain(probe);
      }
    }
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const importers = walk(path.join(process.cwd(), "src")).filter((f) => /from ["'][^"']*part1-anchors["']/.test(fs.readFileSync(f, "utf8")));
    expect(importers).toEqual([]);
  });
});

const q = (...statuses: QuestionStatus[]) => statuses.map((status, i) => ({ id: i + 1, status }));

describe("Part 1 edge cases (docs/part1-plan.md §4)", () => {
  const c11 = configOf(part11);
  const c12 = configOf(part12);

  it("one memorised paragraph for all of Part 1.1 → band 0", () => {
    const score = scoreBand({ questions: q("on_topic", "on_topic", "on_topic"), features: { grammar: "A2", vocabulary: "A2", fluency: "A2", pronunciation: "not_assessed" }, memorizedOrIrrelevant: true }, c11);
    expect(score).toMatchObject({ band: 0, zero_reason: "memorized_or_irrelevant" });
  });

  it("Part 1.1, one word per question → no word floor, three on topic, A1 → band 2 (Higher A1)", async () => {
    const output = modelOutput({ ...PART1_ANCHORS[0], answers: ["Football.", "Plov.", "Mother."], statuses: ["on_topic", "on_topic", "on_topic"], levels: { grammar: "A1", vocabulary: "A1", fluency: "A2" } });
    output.features.grammar.evidence = ["Football"];
    output.features.vocabulary.evidence = ["Plov"];
    output.features.fluency.evidence = [];
    const evaluation = await evaluateSpeaking(inputFor(part11, "Football. Plov. Mother."), returning(output));
    expect(evaluation.result.scoring).toMatchObject({ band: 2, label: "Higher A1", zero_reason: null, language_level: "A1" });
  });

  it("Part 1.1, one relevant word for one question, the others missing → band 1, not band 0", () => {
    const score = scoreBand({ questions: q("on_topic", "missing", "missing"), features: { grammar: "A1", vocabulary: "A1", fluency: "A1", pronunciation: "not_assessed" }, memorizedOrIrrelevant: false, relevantWordCount: 1 }, c11);
    expect(score).toMatchObject({ band: 1, zero_reason: null });
  });

  it("Part 1.1: below_A1 means only no meaningful language → band 0 'below_A1'", () => {
    const score = scoreBand({ questions: q("on_topic", "missing", "missing"), features: { grammar: "below_A1", vocabulary: "below_A1", fluency: "A1", pronunciation: "not_assessed" }, memorizedOrIrrelevant: false }, c11);
    expect(score).toMatchObject({ band: 0, zero_reason: "below_A1" });
  });

  it("Part 1.2, 4 relevant words in the whole part → band 0 (no ratable sample); exactly 5 → scored", async () => {
    const make = (evidence: [string, string, string]) => {
      const output = modelOutput(PART1_ANCHORS[3]);
      output.questions = evidence.map((e, i) => ({ id: i + 1, status: e ? ("partial" as const) : ("missing" as const), evidence: e, note: "x", model_answer: "I think … because …" }));
      for (const f of ["grammar", "vocabulary", "fluency", "cohesion"] as const) output.features[f]!.evidence = [evidence[0]];
      return output;
    };
    const four = await evaluateSpeaking(inputFor(part12, "Family. Burger. Home, yes."), returning(make(["Family. Burger.", "Home, yes.", ""])));
    expect(four.result.scoring).toMatchObject({ band: 0, zero_reason: "too_short" });
    const five = await evaluateSpeaking(inputFor(part12, "Family. Burger. Um, home, yes, cheap."), returning(make(["Family. Burger.", "home, yes, cheap.", ""])));
    expect(five.result.scoring.zero_reason).toBeNull();
    expect(five.result.scoring.band).toBeGreaterThan(0);
  });

  it("Part 1.2, Question 4 partial (one picture only) counts, and the goal says 'talk about both pictures'", async () => {
    const anchor = PART1_ANCHORS[3];
    const output = modelOutput({ ...anchor, statuses: ["partial", "missing", "missing"] });
    const evaluation = await evaluateSpeaking(inputFor(part12, anchor.answers.join(" ")), returning(output));
    expect(evaluation.result.scoring.on_topic_count).toBe(1);
    expect(evaluation.result.scoring.biggest_fix).toEqual({ kind: "question_coverage", question_id: 2 });
    const focus = evaluation.result.retry_focus.map((f) => f.objective).join(" ");
    expect(focus).toMatch(/^Answer question 5: /);
    // A partial Question 4 gets its hint in the goal word for word (here as the second focus, after grammar).
    const all = await evaluateSpeaking(inputFor(part12, anchor.answers.join(" ")), returning(modelOutput({ ...anchor, statuses: ["partial", "on_topic", "on_topic"] })));
    const q4 = all.result.retry_focus.find((f) => f.target.kind === "question")!;
    expect(q4.objective).toMatch(/^Answer question 4 fully: /);
    expect(q4.objective).toContain("talk about both pictures");
    expect(q4.success_check).toContain("talk about both pictures");
  });

  it("Part 1.2, Q5 = 'I prefer home.' is partial: it counts, and the goal asks for a reason", () => {
    const score = scoreBand({ questions: q("on_topic", "partial", "on_topic"), features: { grammar: "B1", vocabulary: "B1", fluency: "B1", cohesion: "B1", pronunciation: "not_assessed" }, memorizedOrIrrelevant: false, relevantWordCount: 40 }, c12);
    expect(score.on_topic_count).toBe(3);
    expect(score.band).toBe(4);
    expect(score.biggest_fix).toEqual({ kind: "feature", feature: "grammar" });
  });

  it("Part 1.1 output with 'partial' or 'minimal', or with cohesion, is rejected by the quality gate", async () => {
    for (const status of ["partial", "minimal"] as const) {
      const output = modelOutput({ ...PART1_ANCHORS[1], statuses: ["on_topic", status, "on_topic"] });
      await expect(evaluateSpeaking(inputFor(part11, PART1_ANCHORS[1].answers.join(" ")), returning(output))).rejects.toMatchObject({ failureCode: "evaluation_quality_rejected" });
    }
    const withCohesion = modelOutput({ ...PART1_ANCHORS[1], levels: { ...PART1_ANCHORS[1].levels, cohesion: "A2" } });
    await expect(evaluateSpeaking(inputFor(part11, PART1_ANCHORS[1].answers.join(" ")), returning(withCohesion))).rejects.toMatchObject({ failureCode: "evaluation_quality_rejected" });
    const offScale = modelOutput({ ...PART1_ANCHORS[1], levels: { grammar: "B1", vocabulary: "A2", fluency: "A2" } });
    await expect(evaluateSpeaking(inputFor(part11, PART1_ANCHORS[1].answers.join(" ")), returning(offScale))).rejects.toMatchObject({ failureCode: "evaluation_quality_rejected" });
  });

  it("above-target grammar and vocabulary with one question missing → topic cap 3 → band 3", () => {
    const score = scoreBand({ questions: q("on_topic", "on_topic", "missing"), features: { grammar: "above_A2", vocabulary: "above_A2", fluency: "above_A2", pronunciation: "not_assessed" }, memorizedOrIrrelevant: false }, c11);
    expect(score.band).toBe(3);
  });

  it("every feature above target except vocabulary at target, full coverage → above_target_requires fails → band 4", () => {
    const score = scoreBand({ questions: q("on_topic", "on_topic", "on_topic"), features: { grammar: "above_B1", vocabulary: "B1", fluency: "above_B1", cohesion: "above_B1", pronunciation: "not_assessed" }, memorizedOrIrrelevant: false, relevantWordCount: 60 }, c12);
    expect(score.language_level).toBe("above_B1");
    expect(score.band).toBe(4);
  });

  it("a level from another ladder is a programming error, never a silent zero", () => {
    expect(() => scoreBand({ questions: q("on_topic", "on_topic", "on_topic"), features: { grammar: "B2", vocabulary: "A2", fluency: "A2", pronunciation: "not_assessed" }, memorizedOrIrrelevant: false }, c11)).toThrow(/not on the ladder/);
  });
});

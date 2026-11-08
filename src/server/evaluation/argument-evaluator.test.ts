import { describe, expect, it } from "vitest";
import { getArgumentTask, listArgumentTasks } from "@/content/speaking/part3";
import { q8ModelOutputSchema, type Q8ModelOutput } from "@/domain/evaluation/q8/model-output";
import { q8ResultSchema } from "@/domain/evaluation/q8/result";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { ProviderError } from "@/server/errors";
import { part3DemoEvaluation, part3DemoSpec, part3DemoTranscriptFor } from "@/server/demo/part3-demo";
import { PART3_ANCHORS } from "../../../test/evaluation-samples/part3-anchors";
import { evaluateArgument } from "./argument-evaluator";
import type { ArgumentEvaluationInput, ArgumentEvaluationModel } from "./argument-types";
import { buildMockArgument, MockArgumentModel } from "./mock-argument-model";
import { mockJudgePoints } from "./mock-argument-rules";
import { buildQ8EvaluationPrompt } from "./prompts/q8-evaluation";
import { applyQ8QualityGate } from "./q8-quality-gate";
import { getArgumentRubric } from "./rubrics/q8";

const TASK = getArgumentTask("c1-part3-cars-in-city-centres")!;

function inputFor(transcript: string, task = TASK, chosen = ["F1", "F2", "A1", "A2"] as const): ArgumentEvaluationInput {
  return {
    task,
    rubric: getArgumentRubric(task),
    transcript,
    metrics: computeSpeechMetrics(transcript, 110_000, 120),
    chosenPoints: [...chosen],
    audio: { storageProvider: "test", storageKey: "k", mimeType: "audio/webm", durationMs: 110_000 },
    previousAttempt: null,
  };
}

/** A model that returns these drafts in turn. */
function scripted(...drafts: unknown[]): ArgumentEvaluationModel & { calls: number } {
  return {
    provider: "test",
    model: "scripted",
    isDevelopmentProvider: true,
    config: {},
    calls: 0,
    async evaluate() {
      return { output: drafts[this.calls++], provider: "test", model: "scripted", inputTokens: null, outputTokens: null };
    },
  };
}

describe("evaluateArgument with the Part 3 mock evaluator", () => {
  it("produces a valid stored result with the plan's override on a read-out anchor (band 1)", async () => {
    const anchor = PART3_ANCHORS.find((a) => a.id === "cars-A1")!;
    const { result } = await evaluateArgument(inputFor(anchor.transcript), new MockArgumentModel());
    expect(q8ResultSchema.safeParse(result).success).toBe(true);
    expect(result.overlap.final_dependence).toBe("reads_prompts");
    expect(result.scoring.band).toBe(1);
    expect(result.scoring.biggest_fix).toEqual({ kind: "prompt_dependence", level: "reads_prompts" });
  });

  it("the rebuttal anchors: FOR points stated then argued against are restated and rebutted (mock rules)", () => {
    for (const anchor of PART3_ANCHORS.filter((a) => a.id.endsWith("-R1"))) {
      const judged = Object.fromEntries(mockJudgePoints(anchor.taskId, anchor.transcript).map((j) => [j.id, j]));
      expect(judged.F1).toMatchObject({ status: "restated", rebutted: true });
      expect(judged.A1.status).toBe("developed");
    }
  });

  it("the model's dependence decides; code overrides only the clear case and flags a disagreement", async () => {
    const anchor = PART3_ANCHORS.find((a) => a.id === "cars-A5")!;
    const draft = buildMockArgument(inputFor(anchor.transcript));
    const said = { ...draft, prompt_dependence: { level: "heavily_dependent" as const, evidence: [], note: "n" } };
    const { result } = await evaluateArgument(inputFor(anchor.transcript), scripted(said));
    expect(result.overlap).toMatchObject({ final_dependence: "heavily_dependent", code_dependence: "own_development", override_applied: false, dependence_disagreement: true });
    expect(result.scoring.band).toBe(2);
  });

  it("a draft the quality gate rejects is regenerated once, then accepted", async () => {
    const transcript = PART3_ANCHORS.find((a) => a.id === "cars-A4")!.transcript;
    const good = buildMockArgument(inputFor(transcript));
    const bad: Q8ModelOutput = { ...good, points: good.points.map((p) => (p.id === "F1" ? { ...p, status: "developed", development_evidence: "words the student never said" } : p)) };
    const model = scripted(bad, good);
    const evaluation = await evaluateArgument(inputFor(transcript), model);
    expect(model.calls).toBe(2);
    expect(evaluation.quality.rejectedDrafts[0].map((v) => v.code)).toContain("quote_not_found");
  });

  it("fails cleanly when both drafts are unusable", async () => {
    await expect(evaluateArgument(inputFor("Some words here for the test."), scripted({ nope: 1 }, "not json"))).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("Part 3 quality gate", () => {
  const transcript = PART3_ANCHORS.find((a) => a.id === "cars-A4")!.transcript;
  const good = buildMockArgument(inputFor(transcript));

  it("passes the mock's own output", () => {
    expect(q8ModelOutputSchema.safeParse(good).success).toBe(true);
    expect(applyQ8QualityGate(good, { transcript, audioAssessed: false }).report.passed).toBe(true);
  });

  it("rejects wrong point order, developed without evidence, fabricated dependence quotes, incoherent own development", () => {
    const codes = (output: Q8ModelOutput) => applyQ8QualityGate(output, { transcript, audioAssessed: false }).report.violations.map((v) => v.code);
    expect(codes({ ...good, points: [...good.points].reverse() })).toContain("point_ids_invalid");
    expect(codes({ ...good, points: good.points.map((p) => ({ ...p, status: "developed" as const, development_evidence: "" })) })).toContain("developed_without_evidence");
    expect(codes({ ...good, prompt_dependence: { level: "heavily_dependent", evidence: ["invented words"], note: "" } })).toContain("dependence_evidence_fabricated");
    expect(codes({ ...good, coherent_and_sustained: false })).toContain("incoherent_but_own_development");
  });

  it("repairs pronunciation judged from a transcript and strengths below C1", () => {
    const pron = { ...good.features.pronunciation, level: "B2" as const };
    const { result, report } = applyQ8QualityGate(
      { ...good, features: { ...good.features, pronunciation: pron, cohesion: { ...good.features.cohesion, level: "B2" } }, strengths: [{ feature: "cohesion", quote: "On the other hand", note: "n" }] },
      { transcript, audioAssessed: false },
    );
    expect(report.passed).toBe(true);
    expect(result.features.pronunciation.level).toBe("not_assessed");
    expect(result.strengths).toEqual([]);
  });
});

describe("the Part 3 prompt (not live-tested)", () => {
  it("lists the statement and both lists by id, the rebuttal rule and the descriptors, and never the band rules", () => {
    const { system, user } = buildQ8EvaluationPrompt(inputFor("x"));
    expect(user).toContain("Statement: Cities should ban private cars from their centres.");
    expect(user).toContain("A3. Public transport is not good enough in many cities");
    expect(system).toContain('"Some people say X, but…" ADDRESSES X');
    expect(system).toContain("A range of cohesive devices are used to clearly indicate the links between ideas.");
    expect(system).not.toMatch(/band \d|cap/i);
  });
});

describe("the Part 3 demo (mock mode)", () => {
  it.each(listArgumentTasks().map((t) => t.id))("%s: first answer band 4 with the rebuttal goal; the retry develops the point: band 5, goal met", async (taskId) => {
    const first = (await part3DemoEvaluation(`p3.${taskId}.F1F2A1A2`))!.result;
    expect(first.scoring).toMatchObject({ band: 4, coverage: "both_sides", biggest_fix: { kind: "point_development", reason: "rebutted", point_id: "A1" } });
    expect(first.chosen_points).toEqual(["F1", "F2", "A1", "A2"]);
    const retry = (await part3DemoEvaluation(`p3.${taskId}.F1F2A1A2.F1F2A1A2`))!.result;
    expect(retry.scoring).toMatchObject({ band: 5, coverage: "both_sides_full", label: "C1" });
    expect(retry.assessment.retry_review?.objectives[0].outcome).toBe("achieved");
  });

  it("the answer follows the chosen points; a retry that drops the goal's point does not meet it", async () => {
    const spec = part3DemoSpec("p3.c1-part3-sugar-tax.F2F3A2A3")!;
    expect(part3DemoTranscriptFor(spec)).toContain("health services");
    const retry = (await part3DemoEvaluation("p3.c1-part3-sugar-tax.F1F2A1A2.F1F2A2A3"))!.result;
    expect(retry.assessment.retry_review?.objectives[0].outcome).toBe("not_achieved");
  });

  it("one point per side: 'Choose two points from each list.'", async () => {
    const result = (await part3DemoEvaluation("p3.c1-part3-smartphones-under-14.F1A1"))!.result;
    expect(result.scoring.needs_two_points_per_side).toBe(true);
  });

  it("unknown or malformed keys give nothing", async () => {
    for (const key of ["p3.nope.F1A1", "p3.c1-part3-sugar-tax.F1F1", "p3.c1-part3-sugar-tax.A1F1", "answer.c1-part3-sugar-tax"]) {
      expect(await part3DemoEvaluation(key)).toBeNull();
    }
  });
});

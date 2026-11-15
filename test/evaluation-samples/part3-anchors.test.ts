import { describe, expect, it } from "vitest";
import { getArgumentTask } from "@/content/speaking/part3";
import { decideDependence, measurePromptOverlap } from "@/domain/evaluation/multilevel/prompt-overlap";
import { scoreQ8Band } from "@/domain/evaluation/q8/band-scoring";
import { POINT_IDS } from "@/domain/speaking/argument-task";
import { getArgumentRubric } from "@/server/evaluation/rubrics/q8";
import { PART3_ANCHORS } from "./part3-anchors";

/**
 * The Part 3 anchors of all three v1 topics (docs/part3-plan.md, sections 8–9): the expected judgements go through
 * the overlap measure, the dependence decision and the scorer, and must give the expected band, coverage, fix and
 * code-measured dependence. No model is called.
 */
describe.each(PART3_ANCHORS)("$id", (anchor) => {
  const task = getArgumentTask(anchor.taskId)!;
  const { config } = getArgumentRubric(task);
  const overlap = measurePromptOverlap(anchor.transcript, task, config.overlap);
  const decision = decideDependence(anchor.modelDependence, overlap, config.overlap);
  const score = scoreQ8Band(
    {
      points: POINT_IDS.map((id) => ({ id, status: anchor.points[id] ?? "not_addressed", rebutted: anchor.rebutted?.includes(id) ?? false })),
      dependence: decision.final,
      features: { grammar: anchor.language, vocabulary: anchor.language, fluency: anchor.language, cohesion: anchor.language, pronunciation: "not_assessed" },
      memorizedOrIrrelevant: false,
    },
    config,
  );

  it("measured overlap gives the expected code level, and code and model agree (no flag)", () => {
    expect(overlap.code_dependence).toBe(anchor.expected.codeDependence);
    expect(decision.override_applied).toBe(anchor.expected.override);
    expect(decision.dependence_disagreement).toBe(anchor.modelDependence !== anchor.expected.codeDependence);
  });

  it(`band ${anchor.expected.band}, coverage ${anchor.expected.coverage}, biggest fix ${anchor.expected.fix}`, () => {
    expect(score.band).toBe(anchor.expected.band);
    expect(score.coverage).toBe(anchor.expected.coverage);
    expect(score.biggest_fix.kind).toBe(anchor.expected.fix);
  });
});

describe("anchor profiles", () => {
  it("every topic has the seven profiles, and each anchor is the right length to speak in 2 minutes", () => {
    for (const taskId of new Set(PART3_ANCHORS.map((a) => a.taskId))) {
      expect(PART3_ANCHORS.filter((a) => a.taskId === taskId).map((a) => a.id.split("-").at(-1))).toEqual(["A0", "A1", "A2", "A3", "A4", "A5", "R1"]);
    }
    for (const a of PART3_ANCHORS) expect(a.transcript.split(/\s+/).length).toBeLessThan(260);
  });

  it("reads-the-list anchors meet the code override: had the model said own development, the band would still be 1", () => {
    for (const anchor of PART3_ANCHORS.filter((a) => a.id.endsWith("-A1"))) {
      const task = getArgumentTask(anchor.taskId)!;
      const { config } = getArgumentRubric(task);
      const decision = decideDependence("own_development", measurePromptOverlap(anchor.transcript, task, config.overlap), config.overlap);
      expect(decision).toMatchObject({ final: "reads_prompts", override_applied: true });
    }
  });

  it("R1 anchors (rebuttal rule): the FOR side is only stated then rebutted, so the fix says to support it first", () => {
    for (const anchor of PART3_ANCHORS.filter((a) => a.id.endsWith("-R1"))) {
      const task = getArgumentTask(anchor.taskId)!;
      const score = scoreQ8Band(
        {
          points: POINT_IDS.map((id) => ({ id, status: anchor.points[id] ?? "not_addressed", rebutted: anchor.rebutted?.includes(id) ?? false })),
          dependence: "own_development",
          features: { grammar: "C1", vocabulary: "C1", fluency: "C1", cohesion: "C1", pronunciation: "not_assessed" },
          memorizedOrIrrelevant: false,
        },
        getArgumentRubric(task).config,
      );
      expect(score.biggest_fix).toEqual({ kind: "point_development", side: "for", reason: "rebutted", point_id: "F1" });
    }
  });
});

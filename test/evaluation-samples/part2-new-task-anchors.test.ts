import { describe, expect, it, vi } from "vitest";
import { getSpeakingTask, listSpeakingTasks } from "@/content/speaking";
import { bandLabel, scoreBand } from "@/domain/evaluation/multilevel/band-scoring";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { MockEvaluationModel } from "@/server/evaluation/mock-evaluation-model";
import { buildMultilevelEvaluationPrompt } from "@/server/evaluation/prompts/multilevel-evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import type { EvaluationInput } from "@/server/evaluation/types";
import { PART2_BAND_ANCHORS } from "./part2-band-anchors";
import { NOT_YET_LIVE_TESTED, PART2_NEW_TASK_ANCHORS } from "./part2-new-task-anchors";

/**
 * Anchor answers for the six newer Part 2 tasks. NOT YET LIVE-TESTED: no model is called here (the dev evaluator is
 * a local mock, and fetch is blocked to prove it). This checks the anchors are well formed and that their expected
 * judgements give the expected band under the official scoring.
 */
const NEW_TASK_IDS = listSpeakingTasks().map((t) => t.id).filter((id) => id !== "b2-part2-advice-from-someone");
const cases = PART2_NEW_TASK_ANCHORS.map((a) => [`${a.taskId} ${a.id}`, a] as const);

function inputFor(anchor: (typeof PART2_NEW_TASK_ANCHORS)[number]): EvaluationInput {
  const task = getSpeakingTask(anchor.taskId)!;
  return {
    task,
    rubric: getSpeakingRubric(task),
    transcript: anchor.transcript,
    metrics: computeSpeechMetrics(anchor.transcript, anchor.durationMs, task.speakingSeconds),
    audio: { storageProvider: "local", storageKey: "k", mimeType: "audio/webm", durationMs: anchor.durationMs },
    previousAttempt: null,
  };
}

describe("Part 2 anchor answers for the six newer tasks (not yet live-tested)", () => {
  it("two per new task: one band 4 (Higher B2) and one band 1 (Lower B1)", () => {
    expect(NEW_TASK_IDS).toHaveLength(6);
    for (const taskId of NEW_TASK_IDS) {
      const anchors = PART2_NEW_TASK_ANCHORS.filter((a) => a.taskId === taskId);
      const rubric = getSpeakingRubric(getSpeakingTask(taskId)!);
      expect(anchors.map((a) => [a.expect.band, bandLabel(a.expect.band, rubric.config)]), taskId).toEqual([
        [4, "Higher B2"],
        [1, "Lower B1"],
      ]);
    }
    expect(PART2_NEW_TASK_ANCHORS).toHaveLength(12);
  });

  it("every one is marked not yet live-tested, with a unique id that does not clash with the advice anchors", () => {
    for (const a of PART2_NEW_TASK_ANCHORS) expect(a.liveStatus).toBe(NOT_YET_LIVE_TESTED);
    expect(NOT_YET_LIVE_TESTED).toBe("not yet live-tested");
    const ids = [...PART2_NEW_TASK_ANCHORS.map((a) => a.id), ...PART2_BAND_ANCHORS.map((a) => a.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(cases)("%s: fits the speaking time, and the band-4 answer covers all three questions in B2", (_name, a) => {
    expect(a.durationMs).toBeGreaterThanOrEqual(60_000);
    expect(a.durationMs).toBeLessThanOrEqual(120_000);
    if (a.expect.band === 4) expect(a.expect).toMatchObject({ language: "B2", questions: ["on_topic", "on_topic", "on_topic"] });
    else {
      expect(a.expect.language).toBe("B1");
      expect(a.expect.questions.filter((s) => s === "on_topic")).toHaveLength(1);
    }
    // An answer, not a picture description.
    expect(a.transcript).not.toMatch(/\b(in this picture|in the picture|I can see)\b/i);
  });

  it.each(cases)("%s: the expected judgements give the expected band under the official scoring", (_name, a) => {
    const level = a.expect.language;
    const score = scoreBand(
      {
        questions: a.expect.questions.map((status, i) => ({ id: i + 1, status })),
        features: { grammar: level, vocabulary: level, fluency: level, cohesion: level, pronunciation: "not_assessed" },
        memorizedOrIrrelevant: a.expect.memorized ?? false,
      },
      getSpeakingRubric(getSpeakingTask(a.taskId)!).config,
    );
    expect(score.band).toBe(a.expect.band);
  });

  it.each(cases)("%s: the pipeline accepts it with the dev evaluator, and no network call is made", async (_name, a) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in this test"));
    try {
      const evaluation = await evaluateSpeaking(inputFor(a), new MockEvaluationModel());
      expect(evaluation.quality.passed).toBe(true);
      expect(evaluation.result.assessment.questions).toHaveLength(3);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  }, 10_000);

  it.each(cases)("%s: the evaluator prompt is built for its own task", (_name, a) => {
    const prompt = buildMultilevelEvaluationPrompt(inputFor(a));
    const task = getSpeakingTask(a.taskId)!;
    for (const q of task.prompts) expect(prompt.user).toContain(q);
    expect(prompt.user.split("<transcript>")[1]).toContain(a.transcript.slice(0, 40));
  });
});

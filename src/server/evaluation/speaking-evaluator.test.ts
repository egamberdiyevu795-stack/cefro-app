import { describe, expect, it, vi } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { ProviderError } from "@/server/errors";
import { makeEvaluation } from "../../../test/fixtures";
import { getSpeakingRubric } from "./rubrics";
import { evaluateSpeaking, validateEvaluationOutput } from "./speaking-evaluator";
import type { EvaluationInput, EvaluationModel } from "./types";
import { EVALUATOR_VERSION } from "./versions";

const task = getSpeakingTask("b2-part2-technology-young-people")!;
const transcript = "I think phones are good. I think they help us talk with friends every day.";
const input: EvaluationInput = {
  task,
  rubric: getSpeakingRubric("B2"),
  transcript,
  metrics: computeSpeechMetrics(transcript, 60_000, task.speakingSeconds),
  audio: { storageProvider: "local", storageKey: "k", mimeType: "audio/webm", durationMs: 60_000 },
  previousAttempt: null,
};

function modelReturning(...outputs: unknown[]): EvaluationModel & { calls: number } {
  const model = {
    provider: "test",
    model: "test-model",
    isDevelopmentProvider: false,
    calls: 0,
    evaluate: vi.fn(async () => {
      const output = outputs[Math.min(model.calls, outputs.length - 1)];
      model.calls += 1;
      return { output, provider: "test", model: "test-model", inputTokens: 10, outputTokens: 20 };
    }),
  };
  return model;
}

describe("validateEvaluationOutput", () => {
  it("accepts a valid object and a valid JSON string", () => {
    expect(validateEvaluationOutput(makeEvaluation()).overall_level).toBe("B1+");
    expect(validateEvaluationOutput(JSON.stringify(makeEvaluation())).overall_level).toBe("B1+");
  });

  it("rejects malformed JSON and schema violations", () => {
    expect(() => validateEvaluationOutput("{not json")).toThrow(ProviderError);
    expect(() => validateEvaluationOutput({ ...makeEvaluation(), overall_level: "Z9" })).toThrow(/overall_level/);
    expect(() =>
      validateEvaluationOutput({
        ...makeEvaluation(),
        criteria: { ...makeEvaluation().criteria, grammar: { assessable: true, score: 14, level: "B2", justification: "x" } },
      }),
    ).toThrow(ProviderError);
    expect(() => validateEvaluationOutput({ ...makeEvaluation(), issues: [] })).toThrow(ProviderError);
  });
});

describe("evaluateSpeaking", () => {
  it("attaches version metadata and a stable prompt hash", async () => {
    const first = await evaluateSpeaking(input, modelReturning(makeEvaluation()));
    const second = await evaluateSpeaking(input, modelReturning(makeEvaluation()));
    expect(first.evaluatorVersion).toBe(EVALUATOR_VERSION);
    expect(first.rubricVersion).toBe("b2-speaking-rubric/1.0.0");
    expect(first.schemaVersion).toBe(1);
    expect(first.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.promptHash).toBe(second.promptHash);
  });

  it("retries once on invalid output, then succeeds", async () => {
    const model = modelReturning("garbage", makeEvaluation());
    const result = await evaluateSpeaking(input, model);
    expect(model.calls).toBe(2);
    expect(result.result.overall_level).toBe("B1+");
  });

  it("fails after repeated invalid output", async () => {
    const model = modelReturning("garbage");
    await expect(evaluateSpeaking(input, model)).rejects.toMatchObject({ failureCode: "evaluation_invalid_output" });
    expect(model.calls).toBe(2);
  });

  it("does not retry provider failures such as timeouts", async () => {
    const model = modelReturning();
    model.evaluate = vi.fn(async () => {
      throw new ProviderError("provider_timeout", "timeout");
    });
    await expect(evaluateSpeaking(input, model)).rejects.toMatchObject({ failureCode: "provider_timeout" });
    expect(model.evaluate).toHaveBeenCalledTimes(1);
  });

  it("forces retry_review to null on a first attempt and clears scores of non-assessable criteria", async () => {
    const evaluation = makeEvaluation({
      retry_review: { objectives: [], summary: "Invented." },
      criteria: {
        ...makeEvaluation().criteria,
        pronunciation: { assessable: false, score: 6, level: "B2", justification: "Guess." },
      },
    });
    const { result } = await evaluateSpeaking(input, modelReturning(evaluation));
    expect(result.retry_review).toBeNull();
    expect(result.criteria.pronunciation).toMatchObject({ score: null, level: null });
  });

  it("includes the transcript, metrics and previous attempt in the prompt", async () => {
    const model = modelReturning(makeEvaluation());
    await evaluateSpeaking(
      {
        ...input,
        previousAttempt: {
          attemptNumber: 1,
          transcript: "old answer",
          evaluation: makeEvaluation(),
          retryFocus: makeEvaluation().retry_focus,
        },
      },
      model,
    );
    const prompt = vi.mocked(model.evaluate).mock.calls[0][0];
    expect(prompt.user).toContain(transcript);
    expect(prompt.user).toContain("speech_metrics");
    expect(prompt.user).toContain("old answer");
    expect(prompt.user).toContain("Use 'I think' at most once");
    expect(prompt.system).toContain("b2".toUpperCase());
  });
});

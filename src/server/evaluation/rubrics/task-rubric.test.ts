import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSpeakingTask, listSpeakingTasks } from "@/content/speaking";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import type { SpeakingTask } from "@/domain/speaking/task";
import { buildSpeakingEvaluationPrompt } from "../prompts/speaking-evaluation-v2";
import { getSpeakingRubric } from "./index";

const task = getSpeakingTask("b2-part2-advice-from-someone")!;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("task type and rubric boundary", () => {
  it("every registered task declares its type and a rubric that exists and matches its level", () => {
    for (const t of listSpeakingTasks()) {
      expect(t.taskType).toBe("long_turn");
      expect(() => getSpeakingRubric(t)).not.toThrow();
    }
  });

  it("selects the rubric by the task's rubricId, not by level alone", () => {
    expect(getSpeakingRubric(task)).toMatchObject({ id: "b2-long-turn", version: "b2-speaking-rubric/1.0.0", targetLevel: "B2" });
    const unknown = { ...task, rubricId: "does-not-exist" } as unknown as SpeakingTask;
    expect(() => getSpeakingRubric(unknown)).toThrow(/unknown rubric/);
    const wrongLevel = { ...task, level: "B1" } as SpeakingTask;
    expect(() => getSpeakingRubric(wrongLevel)).toThrow(/targets B2 but task .* is B1/);
  });

  it("preserves B2 Part 2 behaviour exactly: the rubric and the full prompt are byte-identical to before Stage 3", () => {
    // Golden digests captured from the pre-Stage-3 code (commit 7001248) for this fixed input. If one of
    // these fails, what the model is asked has changed: that needs an evaluator version bump and a live
    // validation run, not just an updated digest. The user-prompt digest was re-captured when the B2 Part 2
    // task was replaced ("Technology and young people" → "Advice from someone"): the task text is part of
    // the user prompt, while the rubric and system prompt (the evaluator template) are unchanged.
    const transcript = "Fixed transcript for the golden digest test. I think phones help people talk every day.";
    const prompt = buildSpeakingEvaluationPrompt({
      task,
      rubric: getSpeakingRubric(task),
      transcript,
      metrics: computeSpeechMetrics(transcript, 60_000, 120),
      audio: { storageProvider: "l", storageKey: "k", mimeType: "audio/webm", durationMs: 60_000 },
      previousAttempt: null,
    });
    expect(sha(getSpeakingRubric(task).text)).toBe("242b8c2e713d151971dcaea14036532bfa5bdb1e8fc836b7dd58cc1de3725a2a");
    expect(sha(prompt.system)).toBe("60988d81200bb33e80da49cd219f61c20429acddb450d276eb37942d7950ceb6");
    expect(sha(prompt.user)).toBe("20230758c8a85d2d330c60d8b8601f206d656909ab7df7b7cd183fdbcec859c7");
  });

  it("keeps the existing task's student-facing content and ids unchanged", () => {
    expect(task).toMatchObject({ id: "b2-part2-advice-from-someone", version: 1, level: "B2", part: 2, preparationSeconds: 60, speakingSeconds: 120 });
    expect(task.prompts).toHaveLength(3);
  });
});

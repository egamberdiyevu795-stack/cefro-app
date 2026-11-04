import { describe, expect, it } from "vitest";
import { getSpeakingTask, listSpeakingTasks } from "@/content/speaking";
import type { SpeakingTask } from "@/domain/speaking/task";
import { getSpeakingRubric } from "./index";

const task = getSpeakingTask("b2-part2-advice-from-someone")!;

describe("task type and rubric boundary", () => {
  it("every registered task declares its type and a rubric that exists and matches its level, part and question count", () => {
    for (const t of listSpeakingTasks()) {
      expect(t.taskType).toBe("long_turn");
      expect(() => getSpeakingRubric(t)).not.toThrow();
    }
  });

  it("selects the rubric by the task's rubricId and checks it fits the task", () => {
    expect(getSpeakingRubric(task)).toMatchObject({ id: "multilevel-q7", version: "multilevel-q7/2.1.0", targetLevel: "B2" });
    const unknown = { ...task, rubricId: "does-not-exist" } as unknown as SpeakingTask;
    expect(() => getSpeakingRubric(unknown)).toThrow(/unknown rubric/);
    expect(() => getSpeakingRubric({ ...task, level: "B1" } as SpeakingTask)).toThrow(/targets B2 but task .* is B1/);
    expect(() => getSpeakingRubric({ ...task, part: 3 })).toThrow(/is for Part 2/);
    expect(() => getSpeakingRubric({ ...task, prompts: task.prompts.slice(0, 2) })).toThrow(/expects 3 questions/);
  });

  it("loads the official Question 7 descriptors verbatim", () => {
    const { config } = getSpeakingRubric(task);
    expect(config.official_question).toBe(7);
    expect(config.descriptors.B2.fluency).toBe("Some pausing while searching for vocabulary but this does not put a strain on the listener.");
    expect(config.descriptors.B1.vocabulary).toBe("Limitations in vocabulary make it difficult to deal fully with the task.");
    expect(config.descriptors.below_B1.cohesion).toBe("Cohesion between ideas is limited. Responses tend to be a list of points.");
  });

  it("is the Q7 task: three numbered questions", () => {
    expect(task).toMatchObject({ id: "b2-part2-advice-from-someone", version: 2, level: "B2", part: 2, rubricId: "multilevel-q7", preparationSeconds: 60, speakingSeconds: 120 });
    expect(task.prompts).toHaveLength(3);
  });
});

import { describe, expect, it } from "vitest";
import { ALL_LESSONS } from "@/content/lessons";
import { selfCheckText } from "./DrillRecorder";
import { practisesLabel } from "./LessonPractice";

describe("drill self-check and labels", () => {
  it("the self-check question is the prompt's own approved instruction", () => {
    expect(selfCheckText(["Answer in one sentence, then add one detail"])).toBe("Listen back. Did you: answer in one sentence, then add one detail?");
    expect(selfCheckText(["Give your opinion", "Give one reason"])).toBe("Listen back. Did you: give your opinion; give one reason?");
    for (const lesson of ALL_LESSONS) {
      for (const item of lesson.drill.items) {
        const asked = selfCheckText(item.check).replace(/^Listen back\. Did you: /, "").replace(/\?$/, "");
        for (const piece of asked.split("; ")) expect(item.prompt.toLowerCase()).toContain(piece.toLowerCase());
      }
    }
  });

  it("labels: the drill-topic question each prompt practises", () => {
    expect(practisesLabel([3])).toBe("Q3");
    expect(practisesLabel([1, 2, 3])).toBe("Q1–Q3");
    expect(ALL_LESSONS.map((l) => l.drill.items.map((d) => practisesLabel(d.practises)))).toEqual([
      ["Q1", "Q2", "Q1–Q3"],
      ["Q1", "Q3", "Q1"],
      ["Q1", "Q3", "Q2"],
    ]);
  });
});

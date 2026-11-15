import { describe, expect, it } from "vitest";
import { demoResultSource } from "@/server/demo/demo-data";
import { resultPageState } from "./view-model";

/* The Part 1 result in the Part 2 style: its own part label, the numbers the student saw, its own skills. */
describe("Part 1 result view", () => {
  it("Part 1.1: 'Part 1.1 · Band 3 · Lower A2', questions 1–3, no cohesion, target A2 band 3", async () => {
    const state = resultPageState((await demoResultSource("answer.a2-part1-1-daily-life"))!);
    if (state.kind !== "scored") throw new Error(state.kind);
    const v = state.view;
    expect(v.headline).toBe("Part 1.1 · Band 3 · Lower A2");
    expect(v.questions.map((q) => q.number)).toEqual([1, 2, 3]);
    expect(v.skills.map((s) => s.name)).toEqual(["Grammar", "Vocabulary", "Pronunciation", "Fluency"]);
    expect(v.target.text).toBe("Target reached: Band 3 · Lower A2");
    expect(v.fix.label).toBe("Question 3 · Not answered");
  });

  it("Part 1.2: questions numbered 4–6, Question 4's hint, cohesion rated, the goal names question 6", async () => {
    const state = resultPageState((await demoResultSource("answer.b1-part1-2-shopping"))!);
    if (state.kind !== "scored") throw new Error(state.kind);
    const v = state.view;
    expect(v.partLabel).toBe("Part 1.2");
    expect(v.questions.map((q) => q.number)).toEqual([4, 5, 6]);
    expect(v.questions[0]).toMatchObject({ verdictLabel: "Partly answered", hint: "Next time, talk about both pictures." });
    expect(v.skills.map((s) => s.name)).toContain("Cohesion");
    expect(v.skills.find((s) => s.name === "Grammar")!.levelLabel).toBe("B1");
    expect(v.fix.label).toBe("Question 6 · Not answered");
    expect(v.fix.goal).toMatch(/^Answer question 6: /);
  });

  it("a retry of a Part 1 demo result says whether its goal was met", async () => {
    const state = resultPageState((await demoResultSource("retry.a2-part1-1-daily-life.answer.a2-part1-1-daily-life"))!);
    if (state.kind !== "scored") throw new Error(state.kind);
    expect(state.view.retry).toMatchObject({ previousBand: 3, band: 4, goal: "met" });
  });
});

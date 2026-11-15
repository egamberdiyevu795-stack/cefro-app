import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { PART12_BANK } from "./part1-2-bank";

describe("Part 1.2 bank (data only, not live)", () => {
  it("the five pages give nine separate tasks (the repeated online-learning task is left out)", () => {
    expect(PART12_BANK).toHaveLength(9);
    expect(new Set(PART12_BANK.map((e) => e.slug)).size).toBe(9);
  });

  it("each entry has three questions and two picture briefs, and the list's broken question is completed", () => {
    for (const e of PART12_BANK) {
      expect(e.questions.every((q) => q.trim().endsWith("?")), e.slug).toBe(true);
      expect(e.pictures.every((p) => p.length > 10), e.slug).toBe(true);
    }
    expect(PART12_BANK.flatMap((e) => e.questions)).not.toContain("Why do some people think that vegetables in a supermarket?");
  });

  it("no entry is a task yet: each needs our own two pictures first", () => {
    for (const e of PART12_BANK) expect(getSpeakingTask(`b1-part1-2-${e.slug}`)).toBeUndefined();
  });
});

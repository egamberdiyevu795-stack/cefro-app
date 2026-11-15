import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { seededRandom, weightedPick } from "@/domain/speaking/weighted-pick";
import { toPublicTask } from "@/domain/speaking/task";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { PART11_QUESTIONS, part11Question, spokenQuestionText } from "./part1-1-bank";
import { PART11_MOCK_QUESTION_NUMBERS, part11DemoAnswers, part11MockKeywords } from "./part1-1-bank-mock";
import {
  PART11_BANK_ENTRY_ID,
  PART11_DEFAULT_SET,
  PART11_TIER_WEIGHTS,
  allPart11Sets,
  getPart11BankTask,
  isValidPart11Set,
  parsePart11SetId,
  part11QuestionAudio,
  part11SetId,
  pickPart11Questions,
  pickPart11SetId,
} from "./part1-1-sets";

describe("Part 1.1 bank: the teacher's list, word for word (owner decision 2026-11-15)", () => {
  it("has the list's 30 questions, numbered 1–30, in three tiers of ten", () => {
    expect(PART11_QUESTIONS.map((q) => q.n)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(PART11_QUESTIONS.filter((q) => q.tier === "most_common").map((q) => q.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(PART11_QUESTIONS.filter((q) => q.tier === "very_common").map((q) => q.n)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(PART11_QUESTIONS.filter((q) => q.tier === "rare").map((q) => q.n)).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
  });

  it("keeps the list's exact wording (spot checks, slashes included)", () => {
    expect(part11Question(1)!.text).toBe("Do you live in a house or a flat?");
    expect(part11Question(2)!.text).toBe("Can you describe your house / your home?");
    expect(part11Question(6)!.text).toBe("What do you usually do at the weekends?");
    expect(part11Question(14)!.text).toBe("Tell me about your close / best friend.");
    expect(part11Question(28)!.text).toBe("What time do you usually get up / go to bed?");
    expect(part11Question(29)!.text).toBe("Tell me about your typical weekday / typical day.");
    expect(part11Question(30)!.text).toBe("Do you like outdoor activities?");
  });

  it("the voice reads 'a / b' as 'a or b'", () => {
    expect(spokenQuestionText("What is your favourite food / meal?")).toBe("What is your favourite food or meal?");
    expect(spokenQuestionText("Tell me about your hometown.")).toBe("Tell me about your hometown.");
  });

  it("every theme has a question of every tier, so the weights work inside each theme", () => {
    for (const theme of ["home", "daily", "preference"] as const) {
      for (const tier of ["most_common", "very_common", "rare"] as const) {
        expect(PART11_QUESTIONS.some((q) => q.theme === theme && q.tier === tier), `${theme} ${tier}`).toBe(true);
      }
    }
  });

  it("every question has mock key words and a demo answer (mock mode only)", () => {
    expect(PART11_MOCK_QUESTION_NUMBERS.sort((a, b) => a - b)).toEqual(PART11_QUESTIONS.map((q) => q.n));
  });
});

describe("weightedPick", () => {
  it("follows the weights (seeded, 30,000 draws)", () => {
    const random = seededRandom(7);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 30_000; i++) counts[weightedPick(["a", "b", "c"] as const, (x) => ({ a: 6, b: 3, c: 1 })[x], random)!]++;
    expect(counts.a / 30_000).toBeCloseTo(0.6, 1);
    expect(counts.b / 30_000).toBeCloseTo(0.3, 1);
    expect(counts.c / 30_000).toBeCloseTo(0.1, 1);
  });

  it("never picks a zero weight; null for nothing to pick", () => {
    expect(weightedPick(["a", "b"], (x) => (x === "a" ? 0 : 1), () => 0)).toBe("b");
    expect(weightedPick(["a", "b"], (x) => (x === "a" ? 1 : 0), () => 0.999999)).toBe("a");
    expect(weightedPick([], () => 1)).toBeNull();
    expect(weightedPick(["a"], () => 0)).toBeNull();
  });

  it("the seeded source repeats", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });
});

describe("pickPart11Questions: one per theme, weighted by tier", () => {
  it("is deterministic with a seeded random source", () => {
    expect(pickPart11Questions(seededRandom(1))).toEqual(pickPart11Questions(seededRandom(1)));
    expect(pickPart11SetId(seededRandom(1))).toBe(part11SetId(pickPart11Questions(seededRandom(1))));
  });

  it("always gives home → daily life → preference, never two questions on the same subject", () => {
    const random = seededRandom(3);
    for (let i = 0; i < 2_000; i++) {
      const set = pickPart11Questions(random);
      expect(isValidPart11Set(set.map(part11Question))).toBe(true);
    }
  });

  it("most-common questions come up most, rare ones rarely (seeded, 20,000 sets)", () => {
    const random = seededRandom(2026);
    const byTier = { most_common: 0, very_common: 0, rare: 0 };
    const byQuestion = new Map<number, number>();
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      for (const n of pickPart11Questions(random)) {
        byTier[part11Question(n)!.tier]++;
        byQuestion.set(n, (byQuestion.get(n) ?? 0) + 1);
      }
    }
    // Share of all asked questions per tier (3 per set).
    expect(byTier.most_common / (3 * N)).toBeGreaterThan(0.55);
    expect(byTier.rare / (3 * N)).toBeLessThan(0.1);
    expect(byTier.most_common).toBeGreaterThan(byTier.very_common);
    expect(byTier.very_common).toBeGreaterThan(byTier.rare);
    // Every question can come up, even the rare ones.
    expect(byQuestion.size).toBe(30);
    // Inside a theme, a most-common question is asked about 6× as often as a rare one (home: Q1 vs Q25).
    expect(byQuestion.get(1)! / byQuestion.get(25)!).toBeGreaterThan(4.5);
    expect(byQuestion.get(1)! / byQuestion.get(25)!).toBeLessThan(8);
  });

  it("the tier weights are 6 : 3 : 1", () => {
    expect(PART11_TIER_WEIGHTS).toEqual({ most_common: 6, very_common: 3, rare: 1 });
  });

  it("leaves out the questions to avoid (the student's last set) while their theme has others", () => {
    const random = seededRandom(9);
    for (let i = 0; i < 500; i++) {
      const last = pickPart11Questions(random);
      const next = pickPart11Questions(random, { avoid: last });
      for (const n of next) expect(last).not.toContain(n);
    }
  });

  it("a breakfast (food) daily question is never followed by a food preference question", () => {
    // random() = 0.99… picks the last question of each theme's list; force the daily pick to breakfast with avoid.
    const daily = PART11_QUESTIONS.filter((q) => q.theme === "daily" && q.n !== 10).map((q) => q.n);
    const random = seededRandom(11);
    for (let i = 0; i < 300; i++) {
      const [, d, p] = pickPart11Questions(random, { avoid: daily });
      expect(d).toBe(10);
      expect(part11Question(p)!.subject).not.toBe("food");
    }
  });
});

describe("Part 1.1 set ids and tasks", () => {
  it("an id names its questions and rebuilds the same task", () => {
    const id = part11SetId([4, 13, 9]);
    expect(id).toBe("a2-part1-1-set-04-13-09");
    expect(parsePart11SetId(id)).toEqual([4, 13, 9]);
    const task = getSpeakingTask(id)!;
    expect(task).toBe(getPart11BankTask(id));
    expect(task.prompts).toEqual(["Tell me about your hometown.", "Do you do any sports / exercise?", "What is your favourite food / meal?"]);
    expect(task.title).toBe("Hometown, sports, favourite food");
    expect(task.delivery!.questions.map((q) => q.audio)).toEqual([4, 13, 9].map(part11QuestionAudio));
    expect(task.evaluatorGuidance).toContain("Question 1 is answered when the student names or describes the town");
    expect(() => getSpeakingRubric(task)).not.toThrow();
    expect(JSON.stringify(toPublicTask(task))).not.toContain("answered when");
  });

  it("refuses ids that are not a valid set: wrong order, unknown number, same subject twice, odd format", () => {
    for (const bad of ["a2-part1-1-set-05-04-09", "a2-part1-1-set-04-05-31", "a2-part1-1-set-04-10-09", "a2-part1-1-set-4-5-9", "a2-part1-1-set-04-05-08-09"]) {
      expect(parsePart11SetId(bad), bad).toBeNull();
      expect(getSpeakingTask(bad), bad).toBeUndefined();
    }
  });

  it("the task list's entry is the default set under its own id", () => {
    const entry = getSpeakingTask(PART11_BANK_ENTRY_ID)!;
    expect(entry.prompts).toEqual(PART11_DEFAULT_SET.map((n) => part11Question(n)!.text));
    expect(entry.title).toBe("Questions about you");
  });

  it("every valid set builds, with audio on disk and demo data for mock mode", () => {
    const sets = allPart11Sets();
    expect(sets.length).toBeGreaterThan(400);
    for (const set of sets) {
      const id = part11SetId(set);
      const task = getSpeakingTask(id)!;
      expect(task.prompts).toHaveLength(3);
      expect(part11MockKeywords(id)).toHaveLength(3);
      expect(part11DemoAnswers(id)!.full).toHaveLength(3);
    }
    for (const q of PART11_QUESTIONS) expect(fs.existsSync(path.join(process.cwd(), "public", part11QuestionAudio(q.n))), String(q.n)).toBe(true);
  });
});

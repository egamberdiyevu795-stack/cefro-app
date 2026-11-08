import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { totalSpeakingSeconds } from "@/domain/speaking/question-sequence";
import { PART1_TASKS, getPart1Task } from ".";

const PUBLIC_DIR = path.join(process.cwd(), "public");

describe("Part 1 content: official timings (docs/part1-plan.md §1, decision 13)", () => {
  it.each(PART1_TASKS.filter((t) => t.part === "1.1").map((t) => [t.id, t] as const))("%s: Part 1.1 is 3 × 30 s, no preparation", (_id, task) => {
    expect(task.questions.map((q) => q.speakingSeconds)).toEqual([30, 30, 30]);
    expect(task.questions.map((q) => q.prepSeconds)).toEqual([0, 0, 0]);
    expect(task.firstQuestionNumber).toBe(1);
    expect(totalSpeakingSeconds(task)).toBe(90);
  });

  it.each(PART1_TASKS.filter((t) => t.part === "1.2").map((t) => [t.id, t] as const))("%s: Part 1.2 is 45 + 30 + 30 s, no preparation", (_id, task) => {
    expect(task.questions.map((q) => q.speakingSeconds)).toEqual([45, 30, 30]);
    expect(task.questions.map((q) => q.prepSeconds)).toEqual([0, 0, 0]);
    expect(task.firstQuestionNumber).toBe(4);
    expect(totalSpeakingSeconds(task)).toBe(105);
  });

  it("there is at least one task for each part", () => {
    expect(PART1_TASKS.map((t) => t.part).sort()).toEqual(["1.1", "1.2"]);
  });
});

describe("Part 1 content: audio files", () => {
  it.each(PART1_TASKS.map((t) => [t.id, t] as const))("%s: every question audio and the chime exist under public/", (_id, task) => {
    for (const src of [...task.questions.map((q) => q.audio), task.chime.src]) {
      expect(src.startsWith("/")).toBe(true);
      expect(fs.existsSync(path.join(PUBLIC_DIR, src)), src).toBe(true);
    }
  });

  it.each(PART1_TASKS.map((t) => [t.id, t] as const))("%s: each question has its own audio file", (_id, task) => {
    const files = task.questions.map((q) => q.audio);
    expect(new Set(files).size).toBe(files.length);
  });

  it("the chime records its source and licence", () => {
    for (const task of PART1_TASKS) {
      expect(task.chime.source.length).toBeGreaterThan(0);
      expect(task.chime.licence.length).toBeGreaterThan(0);
    }
  });

  it("ids are unique and resolvable", () => {
    expect(new Set(PART1_TASKS.map((t) => t.id)).size).toBe(PART1_TASKS.length);
    for (const task of PART1_TASKS) expect(getPart1Task(task.id)).toBe(task);
  });
});

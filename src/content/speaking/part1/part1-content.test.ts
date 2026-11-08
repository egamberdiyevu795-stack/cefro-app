import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PART_LIVE } from "@/config/features";
import { getSpeakingTask, listAllSpeakingTasks, listSpeakingTasks } from "@/content/speaking";
import { totalSpeakingSeconds } from "@/domain/speaking/question-sequence";
import { examPartOf } from "@/domain/speaking/exam-part";
import { toPublicTask } from "@/domain/speaking/task";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { PART1_SPEAKING_TASKS, PART1_TASKS, getPart1Task } from ".";
import { PART1_AUDIO_FILES } from "./question-audio";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const readme = fs.readFileSync(path.join(PUBLIC_DIR, "tasks", "README.md"), "utf8");
const part11 = PART1_SPEAKING_TASKS.filter((t) => examPartOf(t) === "1.1");
const part12 = PART1_SPEAKING_TASKS.filter((t) => examPartOf(t) === "1.2");

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

  it.each(PART1_SPEAKING_TASKS.map((t) => [t.id, t] as const))("%s: the task's own totals match its questions", (_id, task) => {
    expect(task.preparationSeconds).toBe(0);
    expect(task.speakingSeconds).toBe(task.delivery!.questions.reduce((sum, q) => sum + q.speakingSeconds, 0));
    expect(task.delivery!.questions.map((q) => q.text)).toEqual(task.prompts);
  });
});

describe("Part 1 content: tasks, rubrics, release switch", () => {
  it("Part 1.1 tasks are short_answers on multilevel-q1-3 (A2); Part 1.2 tasks picture_questions on multilevel-q4-6 (B1)", () => {
    for (const t of part11) expect([t.taskType, t.rubricId, t.level, t.part]).toEqual(["short_answers", "multilevel-q1-3", "A2", 1]);
    for (const t of part12) expect([t.taskType, t.rubricId, t.level, t.part]).toEqual(["picture_questions", "multilevel-q4-6", "B1", 1]);
    for (const t of PART1_SPEAKING_TASKS) expect(() => getSpeakingRubric(t)).not.toThrow();
  });

  it("Part 1 stays off the task list, the dashboard and the demo student while its parts are not live", () => {
    expect(PART_LIVE["1.1"]).toBe(false);
    expect(PART_LIVE["1.2"]).toBe(false);
    expect(listSpeakingTasks().some((t) => t.part === 1)).toBe(false);
    expect(listAllSpeakingTasks().filter((t) => t.part === 1)).toHaveLength(2);
    for (const t of PART1_SPEAKING_TASKS) expect(getSpeakingTask(t.id)).toBe(t);
  });

  it("Question 4's partial hint is exactly 'compare the two pictures' (shown word for word)", () => {
    for (const t of part12) expect(t.delivery!.questions[0].partialHint).toBe("compare the two pictures");
  });

  it("no task reuses the official sample questions (decision 9)", () => {
    const official = [/walking over driving/i, /car of their own/i, /what do you see in these pictures/i];
    for (const t of PART1_SPEAKING_TASKS) for (const p of t.prompts) for (const o of official) expect(p).not.toMatch(o);
  });

  it("the evaluator guidance never reaches the browser", () => {
    for (const t of PART1_SPEAKING_TASKS) expect(JSON.stringify(toPublicTask(t))).not.toContain(t.evaluatorGuidance.slice(0, 40));
  });
});

describe("Part 1.2 pictures: licence fields (docs/part1-plan.md §1, Pictures)", () => {
  const FIELDS = ["src", "alt", "author", "sourceUrl", "licence", "retrievedAt"] as const;
  it.each(part12.map((t) => [t.id, t] as const))("%s: two pictures, each with every licence field, on disk and in public/tasks/README.md", (_id, task) => {
    expect(task.images).toHaveLength(2);
    for (const image of task.images!) {
      for (const field of FIELDS) expect(typeof image[field] === "string" && image[field].trim().length > 0, `${image.src} ${field}`).toBe(true);
      expect(image.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(fs.existsSync(path.join(PUBLIC_DIR, image.src)), image.src).toBe(true);
      expect(readme).toContain(`\`${image.src.replace("/tasks/", "")}\``);
      expect(image.width).toBeGreaterThan(0);
    }
  });

  it("each picture's file says it is CEFRO's own artwork, with no text drawn in it", () => {
    for (const image of part12.flatMap((t) => t.images!)) {
      const svg = fs.readFileSync(path.join(PUBLIC_DIR, image.src), "utf8");
      expect(svg).toContain("© 2026 CEFRO. All rights reserved.");
      expect(svg).not.toMatch(/<text\b/);
    }
  });
});

describe("Part 1 content: audio files", () => {
  it.each(PART1_TASKS.map((t) => [t.id, t] as const))("%s: every question audio exists under public/", (_id, task) => {
    for (const src of task.questions.map((q) => q.audio)) {
      expect(src.startsWith("/")).toBe(true);
      expect(fs.existsSync(path.join(PUBLIC_DIR, src)), src).toBe(true);
    }
  });

  it.each(PART1_TASKS.map((t) => [t.id, t] as const))("%s: each question has its own audio file", (_id, task) => {
    const files = task.questions.map((q) => q.audio);
    expect(new Set(files).size).toBe(files.length);
  });

  it("the question audio is text-to-speech and records its voice and licence (decision 16)", () => {
    for (const task of PART1_TASKS) {
      expect(task.audioSource.kind).toBe("tts");
      expect(task.audioSource.voice).toMatch(/CC BY 4\.0/);
      expect(task.audioSource.description.length).toBeGreaterThan(0);
    }
  });

  it("each question's audio was made from its current text (change the wording → run scripts/make-part1-question-audio.mjs)", () => {
    const made = new Map(PART1_AUDIO_FILES.map((f) => [f.path, f.text]));
    for (const task of PART1_TASKS) {
      for (const q of task.questions) {
        expect(made.get(q.audio), q.audio).toBe(q.text);
        // Versioned with the task: a new task version gets new files.
        expect(q.audio.startsWith(`/audio/speaking/part1/${task.id}/v${task.version}/`)).toBe(true);
      }
    }
    expect(made.size).toBe(PART1_TASKS.reduce((n, t) => n + t.questions.length, 0));
  });

  it("each audio file is real speech, not a placeholder: a WAV of 1.5–8 s", () => {
    for (const task of PART1_TASKS) {
      for (const q of task.questions) {
        const buf = fs.readFileSync(path.join(PUBLIC_DIR, q.audio));
        expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
        const byteRate = buf.readUInt32LE(28);
        const seconds = (buf.length - 44) / byteRate;
        expect(seconds, q.audio).toBeGreaterThan(1.5);
        expect(seconds, q.audio).toBeLessThan(8);
      }
    }
  });

  it("ids are unique and resolvable", () => {
    expect(new Set(PART1_TASKS.map((t) => t.id)).size).toBe(PART1_TASKS.length);
    for (const task of PART1_TASKS) expect(getPart1Task(task.id)).toBe(task);
  });
});

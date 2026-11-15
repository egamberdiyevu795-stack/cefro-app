import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PART_LIVE } from "@/config/features";
import { getSpeakingTask, listAllSpeakingTasks, listSpeakingTasks } from "@/content/speaking";
import { totalSpeakingSeconds } from "@/domain/speaking/question-sequence";
import { examPartOf } from "@/domain/speaking/exam-part";
import { toPublicTask } from "@/domain/speaking/task";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { PART1_RETIRED_TASKS, PART1_SPEAKING_TASKS, PART1_TASKS as LISTED_TASKS, getPart1Task, toQuestionSequenceTask } from ".";
import { PART1_AUDIO_FILES } from "./question-audio";
import { part11Question, spokenQuestionText } from "./part1-1-bank";
import { PART11_BANK_AUDIO_DIR, PART11_DEFAULT_SET, isPart11BankTaskId, part11BankAudioTexts, part11SetId } from "./part1-1-sets";

// The listed tasks, the retired ones (still opened by id) and one Part 1.1 set (every set is checked in part1-1-sets.test.ts).
const PART1_TASKS = [
  ...LISTED_TASKS,
  ...PART1_RETIRED_TASKS.map(toQuestionSequenceTask),
  getPart1Task(part11SetId([4, 13, 9]))!,
];
/** Where a task's audio lives: its own folder, or the bank's (shared by every Part 1.1 set). */
const audioDirOf = (task: { id: string; version: number }) => (isPart11BankTaskId(task.id) ? PART11_BANK_AUDIO_DIR : `/audio/speaking/part1/${task.id}/v${task.version}`);

const PUBLIC_DIR = path.join(process.cwd(), "public");
const readme = fs.readFileSync(path.join(PUBLIC_DIR, "tasks", "README.md"), "utf8");
const part11 = PART1_SPEAKING_TASKS.filter((t) => examPartOf(t) === "1.1");
const part12 = PART1_SPEAKING_TASKS.filter((t) => examPartOf(t) === "1.2");

describe("Part 1 content: official timings (docs/part1-plan.md §1, decision 13)", () => {
  it.each(PART1_TASKS.filter((t) => t.part === "1.1").map((t) => [t.id, t] as const))("%s: Part 1.1 is 3 × (5 s to prepare + 30 s to speak), as in the real exam", (_id, task) => {
    expect(task.questions.map((q) => q.speakingSeconds)).toEqual([30, 30, 30]);
    expect(task.questions.map((q) => q.prepSeconds)).toEqual([5, 5, 5]);
    expect(task.firstQuestionNumber).toBe(1);
    expect(totalSpeakingSeconds(task)).toBe(90);
  });

  it.each(PART1_TASKS.filter((t) => t.part === "1.2").map((t) => [t.id, t] as const))("%s: Part 1.2 is get ready 10 + 5 + 5 s, speak 45 + 30 + 30 s, as in the real exam", (_id, task) => {
    expect(task.questions.map((q) => q.speakingSeconds)).toEqual([45, 30, 30]);
    expect(task.questions.map((q) => q.prepSeconds)).toEqual([10, 5, 5]);
    expect(task.firstQuestionNumber).toBe(4);
    expect(totalSpeakingSeconds(task)).toBe(105);
  });

  it.each(PART1_TASKS.map((t) => [t.id, t] as const))("%s: opens with a spoken introduction that ends with the chime sample", (_id, task) => {
    expect(task.intro?.text).toMatch(/Start speaking when you hear this sound\.$/);
    expect(task.intro?.audio).toBe(`${audioDirOf(task)}/intro.wav`);
    expect(PART1_AUDIO_FILES.find((f) => f.path === task.intro!.audio)?.text).toBe(task.intro!.text);
  });

  it("there is one task list entry for each part (Part 1.1 is the question bank)", () => {
    expect(LISTED_TASKS.map((t) => t.part).sort()).toEqual(["1.1", "1.2"]);
    expect(LISTED_TASKS[0]!.questions.map((q) => q.text)).toEqual(PART11_DEFAULT_SET.map((n) => part11Question(n)!.text));
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

  it("Question 4 is the exam's own 'What can you see in these pictures?'; its partial hint is 'talk about both pictures' (word for word)", () => {
    for (const t of part12) expect(t.delivery!.questions[0].text).toBe("What can you see in these pictures?");
    for (const t of part12) expect(t.delivery!.questions[0].partialHint).toBe("talk about both pictures");
  });

  it("no task reuses the official sample questions (decision 9)", () => {
    // Question 4 of Part 1.2 uses the exam's own "What can you see in these pictures?" (owner decision 2026-11-15).
    const official = [/walking over driving/i, /car of their own/i];
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
        // The voice reads the list's "a / b" as "a or b" (Part 1.1 bank); every other text is spoken as written.
        expect(made.get(q.audio), q.audio).toBe(spokenQuestionText(q.text));
        // Versioned with the task (or the bank): a new version gets new files.
        expect(q.audio.startsWith(`${audioDirOf(task)}/`)).toBe(true);
      }
    }
    // One file per question and one introduction per fixed task, plus the bank's 30 questions and its introduction.
    const fixed = [...LISTED_TASKS, ...PART1_RETIRED_TASKS.map(toQuestionSequenceTask)].filter((t) => !isPart11BankTaskId(t.id));
    expect(made.size).toBe(fixed.reduce((n, t) => n + t.questions.length + 1, 0) + part11BankAudioTexts().length);
    for (const f of part11BankAudioTexts()) expect(made.get(f.path), f.path).toBe(f.text);
  });

  it("each audio file is real speech, not a placeholder: a WAV of 0.9–8 s (introductions up to 25 s)", () => {
    const seconds = (src: string) => {
      const buf = fs.readFileSync(path.join(PUBLIC_DIR, src));
      expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
      return (buf.length - 44) / buf.readUInt32LE(28);
    };
    for (const task of PART1_TASKS) {
      expect(seconds(task.intro!.audio)).toBeGreaterThan(5);
      expect(seconds(task.intro!.audio)).toBeLessThan(25);
      for (const q of task.questions) {
        const buf = fs.readFileSync(path.join(PUBLIC_DIR, q.audio));
        expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
        const byteRate = buf.readUInt32LE(28);
        const seconds = (buf.length - 44) / byteRate;
        expect(seconds, q.audio).toBeGreaterThan(0.9);
        expect(seconds, q.audio).toBeLessThan(8);
      }
    }
  });

  it("ids are unique and resolvable", () => {
    expect(new Set(PART1_TASKS.map((t) => t.id)).size).toBe(PART1_TASKS.length);
    for (const task of LISTED_TASKS) expect(getPart1Task(task.id)).toBe(task);
    for (const task of PART1_TASKS) expect(getPart1Task(task.id)).toEqual(task);
  });
});

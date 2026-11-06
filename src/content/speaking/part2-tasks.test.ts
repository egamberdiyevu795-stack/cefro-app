import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import HomePage from "@/app/(site)/page";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { toPublicTask } from "@/domain/speaking/task";
import { ensureTaskSnapshot } from "@/server/attempts/attempt-repository";
import { openDatabase, setDbForTesting } from "@/server/db/client";
import { speakingTasks } from "@/server/db/schema";
import { buildMultilevelEvaluationPrompt } from "@/server/evaluation/prompts/multilevel-evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { getSpeakingTask, listSpeakingTasks } from "./index";

/**
 * Every Part 2 task has the same shape as "Advice from someone": 1 min preparation, 2 min speaking, 3 questions, one
 * original CC0 picture with alt text, source and licence (also in public/tasks/README.md), and examiner guidance that
 * says question 3 needs a general opinion and that describing the picture answers nothing.
 */
const tasks = listSpeakingTasks();
const readme = fs.readFileSync(path.join(process.cwd(), "public", "tasks", "README.md"), "utf8");

/** The six tasks added after "Advice from someone", with their questions exactly as written. */
const NEW_TASKS: Array<[id: string, title: string, prompts: [string, string, string]]> = [
  ["b2-part2-important-decision", "An important decision", [
    "What was the decision, and when did you make it?",
    "Why did you decide this, and how did it change your life?",
    "Is it better to make big decisions alone or to ask others for help? Why?",
  ]],
  ["b2-part2-goal-you-set", "A goal you set", [
    "What was the goal, and why did you choose it?",
    "What did you do to reach it, and did you succeed?",
    "Why do some people never reach their goals?",
  ]],
  ["b2-part2-working-in-a-team", "Working in a team", [
    "What was the task, and who was in the team?",
    "What was your role, and how did the team do?",
    "Do people achieve more working alone or in a team? Why?",
  ]],
  ["b2-part2-trying-and-failing", "Trying and failing", [
    "What were you trying to do, and why?",
    "What went wrong, and how did you feel?",
    "Can failure be useful for young people? Why or why not?",
  ]],
  ["b2-part2-a-tradition", "A tradition", [
    "What is the tradition, and when does it happen?",
    "How does your family take part, and what do you enjoy about it?",
    "Should young people keep old traditions in the modern world? Why?",
  ]],
  ["b2-part2-happy-day", "A happy day", [
    "When and where was it, and who were you with?",
    "What happened that made you so happy?",
    "Does money make people happier? Why or why not?",
  ]],
];

describe("Part 2 task list", () => {
  it("has 7 tasks: Advice from someone first, then the six new ones in order, all with unique ids and pictures", () => {
    expect(tasks.map((t) => t.id)).toEqual(["b2-part2-advice-from-someone", ...NEW_TASKS.map(([id]) => id)]);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(7);
    expect(new Set(tasks.map((t) => t.picture?.src)).size).toBe(7);
    expect(new Set(tasks.map((t) => t.title)).size).toBe(7);
  });

  it.each(NEW_TASKS)("%s: title and the three questions exactly as written, version 1", (id, title, prompts) => {
    const task = getSpeakingTask(id)!;
    expect(task).toMatchObject({ title, prompts, version: 1 });
  });
});

describe.each(tasks.map((t) => [t.id, t] as const))("%s", (_id, task) => {
  const picture = task.picture!;

  it("is a Part 2 long turn: B2, 3 questions, 1 min preparation, 2 min speaking, the Question 7 rubric", () => {
    expect(task).toMatchObject({ part: 2, level: "B2", taskType: "long_turn", rubricId: "multilevel-q7", preparationSeconds: 60, speakingSeconds: 120 });
    expect(task.prompts).toHaveLength(3);
    for (const prompt of task.prompts) expect(prompt.trim().length).toBeGreaterThan(10);
    expect(() => getSpeakingRubric(task)).not.toThrow();
    expect(task.question).toMatch(/^Describe .*Answer the three questions below\.$/);
    expect(task.instructions).toContain("You will have 1 minute to prepare. You may make notes on paper.");
    expect(task.instructions).toContain("Then speak for up to 2 minutes. Try to use most of the time.");
    expect(task.instructions.join(" ")).toMatch(/question 3 asks for your general opinion/);
  });

  it("has a picture with alt text, source and licence, sent to the browser", () => {
    expect(picture).toMatchObject({
      src: expect.stringMatching(/^\/tasks\/[a-z0-9-]+\.svg$/),
      width: 480,
      height: 360,
      licence: "CC0 1.0",
      licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    });
    expect(picture.source).toBe("Original illustration made for CEFRO (2026). Not based on any existing image.");
    expect(picture.alt.length).toBeGreaterThan(60);
    expect(picture.alt).toMatch(/\.$/);
    expect(toPublicTask(task).picture).toEqual(picture);
    expect(toPublicTask(task)).not.toHaveProperty("evaluatorGuidance");
  });

  it("the picture file is an original, self-contained SVG: no text, no links, no images, CC0 in its description", () => {
    const file = path.join(process.cwd(), "public", picture.src);
    expect(fs.existsSync(file)).toBe(true);
    const svg = fs.readFileSync(file, "utf8");
    expect(svg).toContain(`viewBox="0 0 ${picture.width} ${picture.height}"`);
    expect(svg).not.toMatch(/<script|href=|xlink:|<image|url\(|<foreignObject|@import/i);
    expect(svg).not.toMatch(/<text|<tspan|<textPath/i); // no words in the picture
    const desc = svg.match(/<desc id="d">([^<]*)<\/desc>/)?.[1];
    expect(desc).toBe(`Original illustration made for CEFRO, released under CC0 1.0. ${picture.alt}`);
  });

  it("the picture is listed in public/tasks/README.md with the same source and licence", () => {
    const row = readme.split("\n").find((line) => line.startsWith(`| \`${path.basename(picture.src)}\``));
    expect(row, "README row for the picture").toBeDefined();
    expect(row).toContain(`\`${task.id}\` (v${task.version})`);
    expect(row).toContain(picture.source);
    expect(row).toContain(`[${picture.licence}](${picture.licenceUrl})`);
  });

  it("examiner guidance: Q1 and Q2 about one story, Q3 a general opinion (not more story), the picture answers nothing", () => {
    const guidance = task.evaluatorGuidance.split("\n");
    expect(guidance[0]).toMatch(/^Questions 1 and 2 are about ONE specific /);
    expect(guidance.some((l) => l.startsWith("Question 1 is answered when the student says "))).toBe(true);
    expect(guidance.some((l) => l.startsWith("Question 2 is answered when the student says "))).toBe(true);
    expect(guidance.some((l) => /do NOT answer questions 1 or 2: mark them missing\.$/.test(l))).toBe(true);
    expect(guidance.some((l) => /^Question 3 is a GENERAL opinion question .* It is answered only when the student gives a general view/.test(l))).toBe(true);
    expect(guidance.some((l) => /^Talking about the student's own .* again .* does NOT answer question 3: mark it missing unless a general view/.test(l))).toBe(true);
    expect(guidance.some((l) => /^The picture only sets the scene\. Describing it \(e\.g\. '.+'\) answers none of the questions/.test(l))).toBe(true);
    expect(guidance.some((l) => l.startsWith("Typical topic vocabulary at B2: "))).toBe(true);
  });

  it("the evaluator prompt carries the questions, the picture's alt text and the guidance (no model call)", () => {
    const transcript = "Last year I made an important decision.";
    const prompt = buildMultilevelEvaluationPrompt({
      task,
      rubric: getSpeakingRubric(task),
      transcript,
      metrics: computeSpeechMetrics(transcript, 90_000, task.speakingSeconds),
      audio: { storageProvider: "none", storageKey: "k", mimeType: "audio/webm", durationMs: 90_000 },
      previousAttempt: null,
    });
    const taskSection = prompt.user.split("<task>")[1].split("</task>")[0];
    expect(taskSection).toContain(`Picture shown to the student (it only sets the scene; describing it answers no question): ${picture.alt}`);
    for (const q of task.prompts) expect(prompt.user).toContain(q);
    expect(prompt.user).toContain(task.evaluatorGuidance);
  });
});

describe("snapshots", () => {
  afterEach(() => setDbForTesting(undefined));

  it("each task is stored with its picture, source and licence", async () => {
    const db = await openDatabase(":memory:");
    setDbForTesting(db);
    for (const task of tasks) await ensureTaskSnapshot(task);
    const rows = await db.select().from(speakingTasks).all();
    expect(rows).toHaveLength(7);
    for (const task of tasks) {
      const row = rows.find((r) => r.id === task.id)!;
      expect(row.version).toBe(task.version);
      expect((row.content as typeof task).picture).toEqual(task.picture);
    }
  });
});

describe("task list page (/)", () => {
  it("shows all 7 tasks, each linking to its own practice page, in order", () => {
    const html = renderToStaticMarkup(createElement(HomePage));
    const hrefs = [...html.matchAll(/href="\/practice\/speaking\/([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(tasks.map((t) => t.id));
    for (const task of tasks) expect(html).toContain(`>${task.title.replace(/'/g, "&#x27;")}<`);
    expect(html.match(/1 min preparation · 2 min speaking/g)).toHaveLength(7);
  });
});

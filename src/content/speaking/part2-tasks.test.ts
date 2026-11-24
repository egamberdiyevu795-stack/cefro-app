import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/practice/page";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { toPublicTask } from "@/domain/speaking/task";
import { ensureTaskSnapshot } from "@/server/attempts/attempt-repository";
import { openDatabase, setDbForTesting } from "@/server/db/client";
import { speakingTasks } from "@/server/db/schema";
import { buildMultilevelEvaluationPrompt } from "@/server/evaluation/prompts/multilevel-evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { PartIntroCard, QuestionsReadingCard } from "@/features/speaking-practice/components/screens";
import { getSpeakingTask, listSpeakingTasks } from "./index";
import part1AudioManifest from "./part1/question-audio.json";
import { PART2_QUESTION_AUDIO_FILES, PART2_QUESTION_AUDIO_VOICE, part2QuestionAudioPath, part2SpokenQuestions } from "./part2-question-audio";

// The task list page asks for a request (`connection()`) before its configuration check; rendered here without one.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => undefined }));
// The real task list reads the caller's own attempts for its "Start here" / "Try next" tag; here, a visitor with none.
const caller = vi.hoisted(() => ({ attempts: [] as unknown[] }));
vi.mock("@/server/identity/current-user", () => ({ findCurrentUserId: async () => (caller.attempts.length ? "user-1" : null) }));
vi.mock("@/server/attempts/attempt-service", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listAttemptHistory: async () => caller.attempts,
}));

/**
 * Every Part 2 task has the same shape as "Advice from someone": 1 min preparation, 2 min speaking, 3 questions, one
 * original CEFRO picture (© 2026 CEFRO, all rights reserved) with alt text, source and licence (also in public/tasks/README.md), and examiner guidance that
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

  it("Advice from someone is version 3 (its picture's licence changed)", () => {
    expect(getSpeakingTask("b2-part2-advice-from-someone")!.version).toBe(3);
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
      licence: "© 2026 CEFRO. All rights reserved.",
    });
    expect(picture).not.toHaveProperty("licenceUrl"); // not an open licence: nothing to link to
    expect(picture.source).toBe("Original illustration made for CEFRO (2026). Not based on any existing image.");
    expect(picture.alt.length).toBeGreaterThan(60);
    expect(picture.alt).toMatch(/\.$/);
    expect(toPublicTask(task).picture).toEqual(picture);
    expect(toPublicTask(task)).not.toHaveProperty("evaluatorGuidance");
  });

  it("the picture file is an original, self-contained SVG: no text, no links, no images, the copyright line in its description", () => {
    const file = path.join(process.cwd(), "public", picture.src);
    expect(fs.existsSync(file)).toBe(true);
    const svg = fs.readFileSync(file, "utf8");
    expect(svg).toContain(`viewBox="0 0 ${picture.width} ${picture.height}"`);
    expect(svg).not.toMatch(/<script|href=|xlink:|<image|url\(|<foreignObject|@import/i);
    expect(svg).not.toMatch(/<text|<tspan|<textPath/i); // no words in the picture
    const desc = svg.match(/<desc id="d">([^<]*)<\/desc>/)?.[1];
    expect(desc).toBe(`Original illustration made for CEFRO. © 2026 CEFRO. All rights reserved. ${picture.alt}`);
    expect(svg).not.toContain("CC0");
  });

  it("the picture is listed in public/tasks/README.md with the same source and licence", () => {
    const row = readme.split("\n").find((line) => line.startsWith(`| \`${path.basename(picture.src)}\``));
    expect(row, "README row for the picture").toBeDefined();
    expect(row).toContain(`\`${task.id}\` (v${task.version})`);
    expect(row).toContain(picture.source);
    expect(row!.split("|").map((c) => c.trim())[5]).toBe(picture.licence);
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

describe("no CC0 link anywhere", () => {
  it("no task has a licenceUrl, and no task file, picture or the pictures' README links to Creative Commons", () => {
    for (const task of tasks) expect(task.picture?.licenceUrl, task.id).toBeUndefined();
    const dirs = [path.join(process.cwd(), "src", "content", "speaking"), path.join(process.cwd(), "public", "tasks")];
    const files = dirs.flatMap((d) => fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name)));
    const offenders = files.filter((f) => !f.endsWith(".test.ts") && /creativecommons\.org/i.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
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

/** The task list page as Next renders it (an async server component that reads the query). */
const homePage = async (query: Record<string, string> = {}) =>
  renderToStaticMarkup(await HomePage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) } as never));

const sectionOf = (html: string, id: string) => html.split(new RegExp(`<section [^>]*id="${id}"`))[1]?.split("</section>")[0];

describe("task list page (/practice)", () => {
  afterEach(() => {
    caller.attempts = [];
  });

  it("shows all 7 Part 2 tasks, each linking to its own practice page, in order", async () => {
    const html = await homePage();
    const hrefs = [...html.matchAll(/href="\/practice\/speaking\/([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(tasks.map((t) => t.id));
    for (const task of tasks) expect(html).toContain(`>${task.title.replace(/'/g, "&#x27;")}<`);
  });

  it("all four parts, in exam order (1.1, 1.2, 2, 3); the Part 2 section is the one the dashboard's Part 2 tile opens", async () => {
    const html = await homePage();
    const ids = [...html.matchAll(/<section [^>]*id="(part-[^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["part-1-1", "part-1-2", "part-2", "part-3"]);
    const section = sectionOf(html, "part-2");
    expect(section).toContain("Part 2 · Long turn");
    expect(section!.match(/href="\/practice\/speaking\//g)).toHaveLength(7);
  });

  it("the timing is said once per part, in its header, never on each row", async () => {
    const html = await homePage();
    expect(html.match(/1 min to prepare · 2 min to speak/g)).toHaveLength(2); // Part 2 and Part 3
    expect(sectionOf(html, "part-1-1")).toContain("3 questions · 30 s each");
    expect(sectionOf(html, "part-1-2")).toContain("3 questions · 45 s for the first, 30 s for the others");
    expect(html).not.toContain("preparation · ");
  });

  it("real page: parts that are not live say Coming soon and link to no task (their pages are a 404)", async () => {
    const html = await homePage();
    for (const id of ["part-1-1", "part-1-2", "part-3"]) {
      const section = sectionOf(html, id)!;
      expect(section).toContain("Coming soon.");
      expect(section).not.toContain("<a ");
    }
    expect(sectionOf(html, "part-2")).not.toContain("Coming soon");
  });

  it("mock mode: the parts that are not live list their tasks too, opening their mock pages, under Coming soon", async () => {
    const html = await homePage({ mock: "1" });
    expect(sectionOf(html, "part-1-1")).toContain('href="/practice/speaking/a2-part1-1-questions?mock=1"');
    expect(sectionOf(html, "part-1-2")).toContain('href="/practice/speaking/b1-part1-2-shopping?mock=1"');
    expect(sectionOf(html, "part-3")).toMatch(/href="\/practice\/part3\/c1-part3-[^"?]+\?mock=1"/);
    for (const id of ["part-1-1", "part-1-2", "part-3"]) expect(sectionOf(html, id)).toContain("You can try the demo below; it is not scored.");
  });

  it("first visit: one tag, 'Start here', on the recommended first task; nothing claims exam frequency", async () => {
    const html = await homePage();
    expect(html.match(/data-testid="task-tag"/g)).toHaveLength(1);
    expect(sectionOf(html, "part-2")!.split('data-testid="task-tag"')[0]).toContain("Advice from someone");
    expect(html).toMatch(/data-testid="task-tag"[^>]*>Start here</);
    expect(html).not.toMatch(/frequent|common|popular|often/i);
  });

  it("mock mode (the demo student has practised): 'Try next' on Practise next's task, and 'Practised dd.mm.yy' on practised tasks", async () => {
    const html = await homePage({ mock: "1" });
    expect(html.match(/data-testid="task-tag"[^>]*>Try next</g)).toHaveLength(1);
    expect(html).not.toContain("Start here");
    expect(html).toMatch(/Practised \d\d\.\d\d\.\d\d/);
  });

  it("SAMPLE frequency labels: only with ?mock=1&freq=1, marked as made up, sorted often → rarely; never on the real site", async () => {
    for (const html of [await homePage(), await homePage({ freq: "1" }), await homePage({ mock: "1" })]) {
      expect(html).not.toMatch(/Often asked|Sometimes asked|Rarely asked|sample-frequency-note/);
    }
    const html = await homePage({ mock: "1", freq: "1" });
    expect(html.match(/data-testid="sample-frequency-note"/g)).toHaveLength(4);
    expect(html).toContain("Made up to preview the idea, not real exam data.");
    const labels = [...sectionOf(html, "part-2")!.matchAll(/(Often|Sometimes|Rarely) asked/g)].map((m) => m[1]);
    expect(labels).toHaveLength(7);
    expect(labels).toEqual([...labels].sort((a, b) => ["Often", "Sometimes", "Rarely"].indexOf(a) - ["Often", "Sometimes", "Rarely"].indexOf(b)));
  });

  it("each open part starts with a topic picked for the student, as in the exam, then 'Or choose a topic' with progress", async () => {
    const part2 = sectionOf(await homePage(), "part-2")!;
    const random = part2.indexOf('data-testid="random-link"');
    expect(random).toBeGreaterThan(-1);
    expect(random).toBeLessThan(part2.indexOf('data-testid="task-link"')); // first, above the list
    expect(part2).toContain('href="/practice/random/2"');
    expect(part2).toContain(">Random topic<");
    expect(part2).toContain("Or choose a topic");
    expect(part2).toContain("0 of 7 practised");
    // Exactly one random row per open part; none on a part that is Coming soon.
    expect(sectionOf(await homePage(), "part-3")).not.toContain("random-link");

    const mock = await homePage({ mock: "1" });
    // Part 1.1 is random by itself (a new question set each time): its one row, no list to choose from.
    const part11 = sectionOf(mock, "part-1-1")!;
    expect(part11).toContain(">Random questions<");
    expect(part11).toContain('href="/practice/speaking/a2-part1-1-questions?mock=1"');
    expect(part11).not.toContain('data-testid="task-link"');
    expect(part11).not.toContain("Or choose a topic");
    expect(sectionOf(mock, "part-1-2")).toContain('href="/practice/random/1.2?mock=1"');
    expect(sectionOf(mock, "part-3")).toContain('href="/practice/random/3?mock=1"');
    // The demo student has practised Part 2: the count says how many of its topics.
    expect(sectionOf(mock, "part-2")).toMatch(/[1-7] of 7 practised/);
  });

  it("no demo label on the real list; in mock mode (?mock=1) the label, and every task opens its brief in mock mode", async () => {
    expect(await homePage()).not.toContain('data-testid="demo-label"');
    const html = await homePage({ mock: "1" });
    expect(html).toContain('data-testid="demo-label"');
    const hrefs = [...sectionOf(html, "part-2")!.matchAll(/href="\/practice\/speaking\/([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(tasks.map((t) => `${t.id}?mock=1`));
  });
});

describe("Part 2 question audio (read aloud after the introduction's chime, before the minute of preparation)", () => {
  it("one file per task version, speaking the task line and the three questions exactly as on screen", () => {
    expect(PART2_QUESTION_AUDIO_FILES.map((f) => f.path)).toEqual(tasks.map((t) => part2QuestionAudioPath(t)));
    for (const task of tasks) {
      const file = PART2_QUESTION_AUDIO_FILES.find((f) => f.path === part2QuestionAudioPath(task))!;
      // Changing a question's wording fails here until its audio is made again (scripts/make-part1-question-audio.mjs).
      expect(file.text, task.id).toBe(part2SpokenQuestions(task));
      expect(file.path).toBe(`/audio/speaking/part2/${task.id}/v${task.version}/questions.wav`);
      for (const q of task.prompts) expect(file.text).toContain(q);
      expect(file.text).toMatch(/^Describe /);
      expect(file.text).not.toContain("Answer the three questions below");
      expect(file.text).not.toMatch(/Look at the (photograph|picture)/i);
    }
  });

  it("uses exactly the Part 1 voice and settings", () => {
    expect(PART2_QUESTION_AUDIO_VOICE).toEqual(part1AudioManifest.voice);
  });

  it.each(tasks.map((t) => [part2QuestionAudioPath(t)] as const))("%s exists as a WAV file in /public", (file) => {
    const full = path.join(process.cwd(), "public", file);
    expect(fs.statSync(full).size).toBeGreaterThan(10_000);
    expect(fs.readFileSync(full).subarray(0, 4).toString("ascii")).toBe("RIFF");
  });
});

describe("Part 2 listening screens", () => {
  it("the questions screen says to listen, has no countdown and no black button; the intro says the questions come next", () => {
    const goal = { objective: "Answer all three questions.", check: null };
    const markup = renderToStaticMarkup(createElement(QuestionsReadingCard, { goal }));
    expect(markup).toContain("Listen");
    expect(markup).toContain("The minute of preparation starts by itself when the reading ends.");
    expect(markup).toContain("Your goal:");
    expect(markup).not.toMatch(/<button|bg-primary text-on-primary|to prepare/);
    const intro = renderToStaticMarkup(
      createElement(PartIntroCard, { part: "Part 2", text: "Part 2. Hello.", goal: null, note: "After the chime, you will hear the questions." }),
    );
    expect(intro).toContain("After the chime, you will hear the questions.");
    expect(intro).not.toContain("starts by itself after the chime");
  });
});

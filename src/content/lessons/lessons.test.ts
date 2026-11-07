import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { plainText } from "@/features/lessons/Rich";
import { ALL_LESSONS, getShownLesson, isApproved, shownLessons, type Lesson } from "./index";

/*
 * The lessons in the app are the lesson files, word for word, and only approved lessons are ever shown.
 */

const ROOT = join(__dirname, "../../..");
/** The file with its whitespace (line wraps) collapsed, so a wrapped paragraph reads as one line. */
const fileText = (lesson: Lesson) => readFileSync(join(ROOT, lesson.source), "utf8").replace(/\s+/g, " ");

/** Every piece of student-facing text in a lesson. */
function texts(lesson: Lesson): string[] {
  return [
    lesson.title,
    lesson.madeUpNote,
    lesson.why.default,
    ...(lesson.why.partial ? [lesson.why.partial] : []),
    ...lesson.explanation.flatMap((b) => (b.kind === "p" ? [b.text] : b.items)),
    lesson.exampleTopic.intro,
    lesson.exampleTopic.title,
    ...lesson.exampleTopic.questions,
    ...(lesson.exampleTopic.picture ? [lesson.exampleTopic.picture] : []),
    lesson.exampleTopic.note,
    ...lesson.examples.flatMap((e) => [e.problem, e.weaker, e.better, e.note]),
    lesson.drill.intro,
    lesson.drill.topic.intro,
    lesson.drill.topic.title,
    ...lesson.drill.topic.questions,
    ...(lesson.drill.topic.picture ? [lesson.drill.topic.picture] : []),
    ...lesson.drill.items.map((d) => d.prompt),
    ...lesson.drill.checklist,
    lesson.retry.intro,
    lesson.retry.objective,
    lesson.retry.successCheck,
    lesson.retry.reminder,
  ];
}

describe.each(ALL_LESSONS.map((lesson) => [`${lesson.id}${lesson.variant ? ` (${lesson.variant})` : ""}`, lesson] as const))("%s", (_name, lesson) => {
  const file = fileText(lesson);

  it("every text is copied word for word from its lesson file", () => {
    for (const text of texts(lesson)) expect(file, text).toContain(text.replace(/\s+/g, " "));
    expect(file).toContain(`# ${lesson.id}${lesson.variant ? ` (${lesson.variant})` : ""} — ${lesson.title}`);
    expect(file).toContain(`| Variant | ${lesson.variantLabel} |`);
    expect(file).toContain(`| Version | ${lesson.version} |`);
    for (const code of lesson.problems) expect(file).toContain(`\`${code}\``);
  });

  it("the app and the lesson file agree on the status, the reviewer and the review date", () => {
    const field = (name: string) => new RegExp(`\\| ${name} \\| ([^|]*) \\|`).exec(file)?.[1].replaceAll("*", "").trim() ?? null;
    expect(field("Status")).toBe(lesson.status);
    expect(field("Reviewed by") || undefined).toBe(lesson.reviewedBy);
    expect(field("Reviewed at") || undefined).toBe(lesson.reviewedAt);
    expect(field("Drafted by")?.toLowerCase()).toBe(lesson.draftedBy);
    expect(field("Written at")).toBe(lesson.writtenAt);
  });

  it("the drill is the approved neutral drill (docs/lessons/drill-drafts.md), word for word; the advice drill is retired", () => {
    const sets = readFileSync(join(ROOT, "docs/lessons/drill-drafts.md"), "utf8").replace(/\s+/g, " ");
    expect(sets).toContain("| Status | **approved** |");
    expect(sets).toContain("| Reviewed by | Asadbek |");
    expect(sets).toContain("| Reviewed at | 2026-11-07 |");
    const set = sets.slice(sets.indexOf(`## ${lesson.id}`), sets.indexOf(" ## ", sets.indexOf(`## ${lesson.id}`) + 3) >>> 0 || undefined);
    const rows = [...set.matchAll(/\| (\d) \| ([^|]+) \| (\d+) s \|/g)].map((m) => [m[2].trim(), Number(m[3])]);
    expect(rows).toEqual(lesson.drill.items.map((d) => [d.prompt, d.seconds]));
    for (const text of [lesson.drill.topic.intro, ...lesson.drill.topic.questions, ...(lesson.drill.topic.picture ? [lesson.drill.topic.picture] : [])]) {
      expect(set, text).toContain(text);
    }
    expect(lesson.drill.items).toHaveLength(3);
    expect(lesson.version).toBe(2);
    for (const item of lesson.drill.items) expect(item.prompt).not.toMatch(/advice|advise/i);
    // The checklist goes with the neutral drill too: no line about advice.
    for (const line of lesson.drill.checklist) expect(line).not.toMatch(/advice|advise/i);
    if (lesson.id === "L-T1") expect(lesson.drill.checklist[2]).toBe("When a question had two parts, I answered both.");
  });

  it("has every example and drill row of the file, in order, with its time; nothing added", () => {
    const exampleRows = [...file.matchAll(/\| (\d) \| [^|]+ \| "([^|]+)" \| "([^|]+)" \| [^|]+ \| yes \|/g)];
    expect(exampleRows.map((m) => [m[2], m[3]])).toEqual(lesson.examples.map((e) => [e.weaker, e.better]));
    const drillRows = [...file.matchAll(/\| (\d) \| ([^|]+) \| (\d+) s \|/g)];
    expect(drillRows.map((m) => [m[2].trim(), Number(m[3])])).toEqual(lesson.drill.items.map((d) => [d.prompt, d.seconds]));
    const checklist = [...file.matchAll(/- \[ \] (.+?)(?= - \[ \]| ## |$)/g)].map((m) => m[1].trim());
    expect(checklist).toEqual(lesson.drill.checklist);
  });

  it("follows the lesson format: explanation at most 120 words, 3–4 made-up examples, 3–5 drill prompts, 2–3 checks", () => {
    const words = lesson.explanation.flatMap((b) => (b.kind === "p" ? [b.text] : b.items)).join(" ");
    expect(plainText(words).split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length).toBeLessThanOrEqual(120);
    expect(lesson.examples.length).toBeGreaterThanOrEqual(3);
    expect(lesson.examples.length).toBeLessThanOrEqual(4);
    expect(lesson.examples.every((e) => e.madeUp)).toBe(true);
    expect(lesson.drill.items.length).toBeGreaterThanOrEqual(3);
    expect(lesson.drill.items.length).toBeLessThanOrEqual(5);
    expect(lesson.drill.checklist.length).toBeGreaterThanOrEqual(2);
    expect(lesson.drill.checklist.length).toBeLessThanOrEqual(3);
  });
});

/** Every piece of lesson text the lesson page shows (not the retry objective and check: the goal comes from the result). */
function shownTexts(lesson: Lesson): { text: string; weakerExample: boolean }[] {
  const plain = [
    lesson.title,
    lesson.madeUpNote,
    lesson.why.default,
    ...(lesson.why.partial ? [lesson.why.partial] : []),
    ...lesson.explanation.flatMap((b) => (b.kind === "p" ? [b.text] : b.items)),
    lesson.exampleTopic.intro,
    ...lesson.exampleTopic.questions,
    ...(lesson.exampleTopic.picture ? [lesson.exampleTopic.picture] : []),
    lesson.exampleTopic.note,
    ...lesson.examples.flatMap((e) => [e.problem, e.better, e.note]),
    lesson.drill.intro,
    lesson.drill.topic.intro,
    ...lesson.drill.topic.questions,
    ...(lesson.drill.topic.picture ? [lesson.drill.topic.picture] : []),
    ...lesson.drill.items.map((d) => d.prompt),
    ...lesson.drill.checklist,
    lesson.retry.intro,
    lesson.retry.reminder,
  ].map((text) => ({ text, weakerExample: false }));
  return [...plain, ...lesson.examples.map((e) => ({ text: e.weaker, weakerExample: true }))];
}

describe("the lessons work for every Part 2 task (approved rewrites, 2026-11-07)", () => {
  it.each(shownLessons().map((l) => [l.slug, l] as const))("%s: no shown text mentions advice, except inside a weaker example", (_slug, lesson) => {
    for (const { text, weakerExample } of shownTexts(lesson)) {
      if (!weakerExample) expect(text).not.toMatch(/advice|advis/i);
    }
  });

  it("the rewritten lines are in the app, the old ones are gone", () => {
    const all = ALL_LESSONS.flatMap((l) => texts(l)).join("\n");
    for (const line of [
      '"In the picture, two people are standing in a park" answers no question, even if it uses a word from the question.',
      "The first questions usually ask about **your own** experience: your story, not the people in the picture.",
      "If no story comes quickly, use a simple true one from your own life, even a small one.",
      'A bare answer like "Yes, I did." or "No, they shouldn\'t." is marked as not answered.',
    ]) expect(all).toContain(line);
    for (const lesson of ALL_LESSONS) expect(lesson.exampleTopic.note).toBe("These examples use a different topic from your task, so you practise the skill, not the words.");
    for (const old of ["The man is giving advice to the girl", "received advice", "who told you what to do", "My father gave me advice", "never use the advice topic"]) {
      expect(all).not.toContain(old);
    }
  });
});

describe("only approved lessons are shown", () => {
  const draft: Lesson = { ...ALL_LESSONS[0], slug: "draft-lesson", status: "draft", reviewedBy: undefined, reviewedAt: undefined };
  const unreviewed: Lesson = { ...ALL_LESSONS[0], slug: "unreviewed-lesson", status: "approved", reviewedBy: undefined };

  it("the three wave 1 lessons are in the app, each approved with a reviewer and a date", () => {
    expect(ALL_LESSONS.map((l) => l.slug)).toEqual(["l-t1", "l-t8", "l-t4-b2"]);
    for (const lesson of ALL_LESSONS) {
      expect(isApproved(lesson), lesson.slug).toBe(true);
      expect(getShownLesson(lesson.slug)).toBe(lesson);
    }
  });

  it("a draft, or an 'approved' lesson with no reviewer, is never returned", () => {
    const lessons = [...ALL_LESSONS, draft, unreviewed];
    expect(isApproved(draft)).toBe(false);
    expect(isApproved(unreviewed)).toBe(false);
    expect(shownLessons(lessons)).toEqual(ALL_LESSONS);
    expect(getShownLesson("draft-lesson", lessons)).toBeUndefined();
    expect(getShownLesson("unreviewed-lesson", lessons)).toBeUndefined();
    expect(getShownLesson("nope", lessons)).toBeUndefined();
  });

  it("slugs and lesson ids (with their variant) are unique", () => {
    expect(new Set(ALL_LESSONS.map((l) => l.slug)).size).toBe(ALL_LESSONS.length);
    expect(new Set(ALL_LESSONS.map((l) => `${l.id}|${l.variant ?? ""}`)).size).toBe(ALL_LESSONS.length);
  });
});

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
    expect(file).toContain(`| Task used | \`${lesson.drill.taskId}\``);
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

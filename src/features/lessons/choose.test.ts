import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_LESSONS, type Lesson } from "@/content/lessons";
import { listSpeakingTasks } from "@/content/speaking";
import { evidenceTokens } from "@/domain/evaluation/evidence";
import { demoEvaluation, demoResultSpec } from "@/server/demo/demo-data";
import { LIVE_36_FLASH_FIXTURES } from "../../../test/fixtures/live-3.6-flash";
import { fillLessonText, lessonForResult, lessonHref, lessonKeyFor, lessonWhy } from "./choose";

const ADVICE = "b2-part2-advice-from-someone";
const result = async (key: string) => (await demoEvaluation(key))!.result;

describe("which lesson a result leads to (teaching plan, section 4)", () => {
  it("a missing question → L-T1 (the demo result of 'A tradition', and the other first answers)", async () => {
    for (const key of ["demo-5", "answer.b2-part2-a-tradition", "demo-1", "demo-2"]) {
      expect(lessonForResult(await result(key))?.slug, key).toBe("l-t1");
    }
    for (const run of LIVE_36_FLASH_FIXTURES["A1-b1-only-q3"].runs) expect(lessonForResult(run.evaluation.result)?.slug).toBe("l-t1");
  });

  it("only the picture described (every question off topic) → L-T8; a bare one-sentence answer → L-T4 (B2)", async () => {
    expect(lessonKeyFor(await result(`picture.${ADVICE}`))).toEqual({ id: "L-T8" });
    expect(lessonForResult(await result(`picture.${ADVICE}`))?.slug).toBe("l-t8");
    expect(lessonKeyFor(await result(`bare.${ADVICE}`))).toEqual({ id: "L-T4", variant: "B2" });
    expect(lessonForResult(await result(`bare.${ADVICE}`))?.slug).toBe("l-t4-b2");
  });

  it("no approved lesson for the fix → no lesson (feature fixes, own words, other off-topic answers)", async () => {
    for (const key of ["demo-4", "demo-6"]) expect(lessonForResult(await result(key)), key).toBeNull();
    for (const anchor of ["A0-below-b1", "A2-b1-all-three", "A4-b2-all-three", "A5-above-b2"]) {
      for (const run of LIVE_36_FLASH_FIXTURES[anchor].runs) expect(lessonForResult(run.evaluation.result), anchor).toBeNull();
    }
    const memorized = LIVE_36_FLASH_FIXTURES["A0-memorized-off-topic"].runs[0].evaluation.result;
    expect(lessonKeyFor(memorized)).toEqual({ id: "L-T6" }); // planned, not written yet
    expect(lessonForResult(memorized)).toBeNull();

    // Every question off topic but no picture words: L-T2 / L-T3 (not written), so no lesson.
    const picture = await result(`picture.${ADVICE}`);
    const offTopic = {
      ...picture,
      assessment: { ...picture.assessment, questions: picture.assessment.questions.map((q) => ({ ...q, evidence: "I like football.", note: "About something else." })) },
    };
    expect(lessonKeyFor(offTopic)).toEqual({ id: "L-T2" });
    expect(lessonForResult(offTopic)).toBeNull();
  });

  it("a draft lesson is never chosen, even when it is the plan's lesson", async () => {
    const drafts: Lesson[] = ALL_LESSONS.map((l) => ({ ...l, status: "draft" }));
    for (const key of ["demo-5", `picture.${ADVICE}`, `bare.${ADVICE}`]) expect(lessonForResult(await result(key), drafts)).toBeNull();
  });

  it("the retry carries the lesson's own objective: the result's first retry focus is the lesson's objective, filled in", async () => {
    for (const key of ["demo-5", `picture.${ADVICE}`, `bare.${ADVICE}`]) {
      const r = await result(key);
      const lesson = lessonForResult(r)!;
      const fix = r.scoring.biggest_fix;
      const n = fix.kind === "question_coverage" ? fix.question_id : 1;
      const task = demoResultSpec(key)!.task;
      const values = { n, questionText: task.prompts[n - 1], evidence: "", note: "" };
      expect(r.retry_focus[0].objective).toBe(fillLessonText(lesson.retry.objective, values));
      expect(r.retry_focus[0].success_check).toBe(fillLessonText(lesson.retry.successCheck, values));
      const why = lessonWhy(lesson, r, task.prompts);
      expect(why).not.toMatch(/[{}]/);
    }
  });

  it("'Why this lesson' fills the lesson's line from the result", async () => {
    const tradition = listSpeakingTasks().find((t) => t.id === "b2-part2-a-tradition")!;
    const why = lessonWhy(ALL_LESSONS[0], await result("demo-5"), tradition.prompts);
    expect(why).toBe(
      'You did not answer Question 3: "Should young people keep old traditions in the modern world? Why?". Development estimate: 0 key word(s) from question 3 appear in your answer.',
    );
    // No quote: the empty quotation marks are left out.
    expect(fillLessonText('Your answer to Question {n} was too short to count: "{evidence quote}". {evaluator note}', { n: 2, questionText: "", evidence: "", note: "Too short." })).toBe(
      "Your answer to Question 2 was too short to count. Too short.",
    );
  });

  it("lesson links keep ?mock=1 in mock mode", () => {
    expect(lessonHref({ slug: "l-t1" }, { demo: "demo-5" }, { mock: true })).toBe("/lessons/l-t1?demo=demo-5&mock=1");
    expect(lessonHref({ slug: "l-t1" }, { anchor: "A1-b1-only-q3", run: 2 }, { mock: true })).toBe("/lessons/l-t1?anchor=A1-b1-only-q3&run=2&mock=1");
    expect(lessonHref({ slug: "l-t1" }, { attempt: "abc" })).toBe("/lessons/l-t1?attempt=abc");
  });
});

/*
 * Lesson examples never use the retry task's topic (teaching plan, section 3), so a student can't copy a lesson
 * sentence into the retry. Checked for every lesson against every Part 2 task.
 */

/** The words that name each task's topic. Every Part 2 task must be listed here (checked below). */
const TOPIC_WORDS: Record<string, string[]> = {
  "b2-part2-advice-from-someone": ["advice", "advise", "advised", "adviser"],
  "b2-part2-important-decision": ["decision", "decisions", "decide", "decided", "deciding"],
  "b2-part2-goal-you-set": ["goal", "goals"],
  "b2-part2-working-in-a-team": ["team", "teams", "teamwork", "teammate", "teammates"],
  "b2-part2-trying-and-failing": ["fail", "failed", "failing", "failure", "failures"],
  "b2-part2-a-tradition": ["tradition", "traditions", "traditional"],
  "b2-part2-happy-day": ["happy day", "happiest day", "happy days"],
};

const part2Tasks = listSpeakingTasks().filter((t) => t.part === 2);
const hasPhrase = (text: string, phrase: string) => ` ${evidenceTokens(text).join(" ")} `.includes(` ${evidenceTokens(phrase).join(" ")} `);
/**
 * Words of the shared Part 2 question frame ("Do you think young people…? Why or why not?", "Is it better to…"). A run of
 * four words made only of these says nothing about the topic, so the repeated-words check skips it.
 */
const FRAME = new Set(
  "a an the and or not why how what when where who whom did do does you your i me my is it was were be better to think young people in of for with about feel felt".split(" "),
);
const ngrams = (text: string, n: number) => {
  const words = evidenceTokens(text);
  return words.length < n ? [] : words.slice(0, words.length - n + 1).map((_, i) => words.slice(i, i + n).join(" "));
};

describe("lesson examples and drills never use any Part 2 task's topic", () => {
  it("there are 7 Part 2 tasks, and each has its topic words listed", () => {
    expect(part2Tasks).toHaveLength(7);
    expect(Object.keys(TOPIC_WORDS).sort()).toEqual(part2Tasks.map((t) => t.id).sort());
  });

  const cases = ALL_LESSONS.flatMap((lesson) => part2Tasks.map((task) => [lesson.slug, task.id, lesson, task] as const));
  it.each(cases)("%s × %s", (_slug, _taskId, lesson, task) => {
    const topic = lesson.exampleTopic;
    const sentences = lesson.examples.flatMap((e) => [e.weaker, e.better]);
    const drill = lesson.drill.topic;
    const drillText = [drill.title, ...drill.questions, ...(drill.picture ? [drill.picture] : []), ...lesson.drill.items.map((d) => d.prompt)];
    const exampleText = [topic.title, ...topic.questions, ...(topic.picture ? [topic.picture] : []), ...sentences, ...drillText];

    // A different topic: not the task's title, introduction or questions.
    expect(hasPhrase(topic.title, task.title)).toBe(false);
    expect(topic.title).not.toBe(task.question);
    for (const q of topic.questions) expect(task.prompts).not.toContain(q);

    // No topic word of the task, in the example topic or in any example sentence.
    for (const text of exampleText) for (const word of TOPIC_WORDS[task.id]) expect(hasPhrase(text, word), `"${word}" in "${text}"`).toBe(false);

    // No example sentence or drill text repeats four words in a row of the task's title, introduction or questions
    // (question-frame words alone don't count).
    const taskGrams = new Set([task.title, task.question, ...task.prompts].flatMap((t) => ngrams(t, 4)).filter((g) => g.split(" ").some((w) => !FRAME.has(w))));
    expect(hasPhrase(drill.title, task.title)).toBe(false);
    for (const q of drill.questions) expect(task.prompts).not.toContain(q);
    for (const sentence of [...sentences, ...drillText]) for (const gram of ngrams(sentence, 4)) expect(taskGrams.has(gram), `"${gram}" in "${sentence}"`).toBe(false);
  });
});

describe("drill sets (docs/lessons/drill-drafts.md)", () => {
  const file = readFileSync(join(process.cwd(), "docs/lessons/drill-drafts.md"), "utf8");
  const prompts = [...file.matchAll(/^\| \d \| (.+?) \| \d+ s \|$/gm)].map((m) => m[1]);
  const topics = [...file.matchAll(/^Drill (?:topic|picture) \(made up\): (.+)$/gm)].map((m) => m[1]);

  it("are approved, and are exactly the drills the app shows", () => {
    expect(file).toContain("| Status | **approved** |");
    expect(file).toContain("| Reviewed by | Asadbek |");
    expect(prompts).toEqual(ALL_LESSONS.flatMap((l) => l.drill.items.map((d) => d.prompt)));
  });

  it("3 prompts per lesson, none using any of the 7 Part 2 tasks' topics", () => {
    expect(prompts).toHaveLength(9);
    expect(topics.length).toBeGreaterThanOrEqual(3);
    for (const task of part2Tasks) {
      for (const text of [...prompts, ...topics]) for (const word of TOPIC_WORDS[task.id]) expect(hasPhrase(text, word), `"${word}" in "${text}"`).toBe(false);
    }
  });
});

/**
 * Which lesson a result leads to (docs/teaching-plan.md, section 4). Chosen by code from the evaluator's own
 * `biggest_fix` and question statuses, never by the model. One lesson at a time: only the biggest fix has one.
 *
 * `lessonKeyFor` follows the whole plan (it may name a lesson that is not written yet); `lessonForResult` returns
 * the lesson only when it exists AND is approved, else null, so the result page shows no link. Pure and browser-safe.
 */
import { ALL_LESSONS, shownLessons, type Lesson } from "@/content/lessons";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";

export interface LessonKey {
  id: string;
  variant?: Lesson["variant"];
}

/** The level variant of L-T4 for each part: the part's own target (teaching plan, section 4). */
const L_T4_VARIANT: Record<number, Lesson["variant"]> = { 2: "B2" };

/** Words that show an answer talks about the picture itself ("In the picture I can see…"). */
const PICTURE_WORDS = /\b(picture|photo|photograph|image)\b|\bi can see\b/i;

/** The plan's lesson for this result's biggest fix, written or not; null when the plan has none (feature lessons come in wave 2). */
export function lessonKeyFor(result: MultilevelResult): LessonKey | null {
  const fix = result.scoring.biggest_fix;
  if (fix.kind === "own_words") return { id: "L-T6" };
  if (fix.kind !== "question_coverage") return null;
  const questions = result.assessment.questions;
  const question = questions.find((q) => q.id === fix.question_id);
  if (!question) return null;
  switch (question.status) {
    case "missing":
      return { id: "L-T1" };
    case "partial":
    case "minimal": {
      const variant = L_T4_VARIANT[result.part];
      return variant ? { id: "L-T4", variant } : null;
    }
    case "off_topic": {
      const allOffTopic = questions.every((q) => q.status === "off_topic");
      if (allOffTopic && questions.some((q) => PICTURE_WORDS.test(q.evidence) || PICTURE_WORDS.test(q.note))) return { id: "L-T8" };
      // Part 2 question 3 is the opinion question: off topic there is usually the story told again.
      if (result.part === 2 && question.id === 3) return { id: "L-T3" };
      return { id: "L-T2" };
    }
    default:
      return null;
  }
}

/** The approved lesson for this result's biggest fix, or null (no lesson in the plan, not written, or not approved). */
export function lessonForResult(result: MultilevelResult, lessons: readonly Lesson[] = ALL_LESSONS): Lesson | null {
  const key = lessonKeyFor(result);
  if (!key) return null;
  return (
    shownLessons(lessons).find(
      (lesson) => lesson.id === key.id && (lesson.variant ?? null) === (key.variant ?? null) && lesson.parts.includes(result.part as Lesson["parts"][number]),
    ) ?? null
  );
}

/** Fills a lesson template's placeholders ({n}, {question text}, {evidence quote}, {evaluator note…}). */
export function fillLessonText(template: string, values: { n: number; questionText: string; evidence: string; note: string }): string {
  let text = template;
  // With no quote, the quote and the colon before it are left out instead of showing empty quotation marks.
  if (!values.evidence.trim()) text = text.replace(/: "\{evidence quote\}"/, "");
  return text
    .replace(/\{evaluator note(?: for Question \{n\})?\}/g, values.note.trim())
    .replaceAll("{evidence quote}", values.evidence.trim())
    .replaceAll("{question text}", values.questionText)
    .replaceAll("{n}", String(values.n))
    .trim();
}

/** "Why this lesson": the lesson's line, filled from the result's biggest-fix question. */
export function lessonWhy(lesson: Lesson, result: MultilevelResult, prompts: readonly string[]): string {
  const fix = result.scoring.biggest_fix;
  const id = fix.kind === "question_coverage" ? fix.question_id : 1;
  const question = result.assessment.questions.find((q) => q.id === id);
  const template = question?.status === "partial" && lesson.why.partial ? lesson.why.partial : lesson.why.default;
  return fillLessonText(template, { n: id, questionText: prompts[id - 1] ?? `Question ${id}`, evidence: question?.evidence ?? "", note: question?.note ?? "" });
}

/** Where a lesson link reads its result from: a demo result, a saved live run (prototype) or a real attempt. */
export type LessonSource = { demo: string } | { anchor: string; run: number } | { attempt: string };

/** The lesson page of a result. Mock mode keeps `?mock=1`, like every link in it. */
export function lessonHref(lesson: Pick<Lesson, "slug">, source: LessonSource, options: { mock?: boolean } = {}): string {
  const params = new URLSearchParams();
  if ("demo" in source) params.set("demo", source.demo);
  else if ("anchor" in source) {
    params.set("anchor", source.anchor);
    params.set("run", String(source.run));
  } else params.set("attempt", source.attempt);
  if (options.mock) params.set("mock", "1");
  return `/lessons/${encodeURIComponent(lesson.slug)}?${params}`;
}
